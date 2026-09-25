<?php
/* ============================================
   Lebenslauf-Rechner — Auswertungen in der Datenbank
   Speichert die ausgewerteten Personen (Name, erkannte Stellen, Text des Lebenslaufs, Einstellungen
   der Auswertung), damit sie nach dem Neuladen noch da sind. Zugriff nur mit dem Zugangspasswort.
   Die Tabelle wird beim ersten Aufruf automatisch angelegt.
   Aufrufe:
     GET    candidates.php?action=status  -> {"enabled", "keepDays", "problem"}
     GET    candidates.php                -> {"candidates": [...]}              (Passwort nötig)
     POST   candidates.php                -> Body {"candidate": {...}} speichern (Passwort nötig)
     DELETE candidates.php?id=…           -> Person löschen                    (Passwort nötig)
   Einträge, die länger als «keep_days» nicht geändert wurden, werden automatisch gelöscht.
   ============================================ */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function fail($status, $message) {
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

$configFile = __DIR__ . '/config.php';
$config = is_file($configFile) ? require $configFile : null;
if (!is_array($config)) $config = [];
$password = (string) ($config['password'] ?? '');
$hasPassword = $password !== '' && $password !== 'ein-langes-zufaelliges-passwort';
$db = $config['db'] ?? null;
$hasDb = is_array($db) && (!empty($db['dsn']) || (!empty($db['host']) && !empty($db['name']) && !empty($db['user'])));
$keepDays = max(0, (int) ($config['keep_days'] ?? 180));
$table = preg_replace('/[^a-z0-9_]/i', '', $db['table'] ?? 'lr_candidates');

function problem($configFile, $hasPassword, $hasDb) {
    if (!is_file($configFile)) return 'Im Ordner «api» gibt es keine Datei «config.php».';
    if (!$hasPassword) return 'In config.php ist kein Zugangspasswort («password») gesetzt. Ohne Passwort werden keine Personendaten gespeichert.';
    if (!$hasDb) return 'In config.php fehlen die Datenbank-Angaben («db»).';
    return null;
}

function connect($db) {
    $dsn = !empty($db['dsn']) ? $db['dsn']
        : sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $db['host'], (int) ($db['port'] ?? 3306), $db['name']);
    $pdo = new PDO($dsn, $db['user'] ?? null, $db['password'] ?? null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 10,
    ]);
    return $pdo;
}

function ensureTable($pdo, $table) {
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $pdo->exec("CREATE TABLE IF NOT EXISTS $table (
        id VARCHAR(40) NOT NULL PRIMARY KEY,
        name VARCHAR(255) NOT NULL DEFAULT '',
        data " . ($mysql ? 'MEDIUMTEXT' : 'TEXT') . " NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
    )" . ($mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : ''));
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if ($action === 'status' && $method === 'GET') {
    $problem = problem($configFile, $hasPassword, $hasDb);
    if ($problem === null) {
        try { ensureTable(connect($db), $table); }
        catch (Exception $e) { $problem = 'Keine Verbindung zur Datenbank. Bitte die Angaben «db» in config.php prüfen.'; }
    }
    echo json_encode(['enabled' => $problem === null, 'keepDays' => $keepDays, 'problem' => $problem]);
    exit;
}

$problem = problem($configFile, $hasPassword, $hasDb);
if ($problem !== null) fail(503, $problem);
$given = $_SERVER['HTTP_X_APP_PASSWORD'] ?? '';
if (!is_string($given) || !hash_equals($password, $given)) {
    sleep(1); // bremst das Durchprobieren von Passwörtern
    fail(401, 'Falsches Zugangspasswort.');
}

try {
    $pdo = connect($db);
    ensureTable($pdo, $table);
} catch (Exception $e) {
    fail(500, 'Keine Verbindung zur Datenbank. Bitte die Angaben «db» in config.php prüfen.');
}
$now = gmdate('Y-m-d H:i:s');

if ($method === 'GET') {
    if ($keepDays > 0) {
        $pdo->prepare("DELETE FROM $table WHERE updated_at < ?")->execute([gmdate('Y-m-d H:i:s', time() - $keepDays * 86400)]);
    }
    $rows = $pdo->query("SELECT id, data, created_at, updated_at FROM $table ORDER BY created_at")->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $c = json_decode($r['data'], true);
        if (!is_array($c)) continue;
        $c['id'] = $r['id'];
        $c['savedAt'] = $r['updated_at'] . 'Z';
        $out[] = $c;
    }
    echo json_encode(['candidates' => $out, 'keepDays' => $keepDays]);
    exit;
}

if ($method === 'DELETE') {
    $id = (string) ($_GET['id'] ?? '');
    if ($id === '') fail(400, 'Es fehlt die ID.');
    $pdo->prepare("DELETE FROM $table WHERE id = ?")->execute([$id]);
    echo json_encode(['deleted' => $id]);
    exit;
}

if ($method !== 'POST') fail(405, 'Nur GET, POST und DELETE erlaubt.');

$maxBytes = 8 * 1024 * 1024;
$body = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
if ($body === false || strlen($body) > $maxBytes) fail(413, 'Die Auswertung ist zu gross (max. 8 MB).');
$data = json_decode($body, true);
$c = $data['candidate'] ?? null;
$id = is_array($c) ? (string) ($c['id'] ?? '') : '';
if ($id === '' || strlen($id) > 40 || !preg_match('/^[A-Za-z0-9_-]+$/', $id)) fail(400, 'Ungültige Auswertung.');
unset($c['pdfBase64'], $c['loading'], $c['savedAt']); // PDFs werden nicht gespeichert
$json = json_encode($c, JSON_UNESCAPED_UNICODE);
$name = (string) ($c['name'] ?? '');
$name = function_exists('mb_substr') ? mb_substr($name, 0, 255) : substr($name, 0, 255);

if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
    $sql = "INSERT INTO $table (id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE name = VALUES(name), data = VALUES(data), updated_at = VALUES(updated_at)";
} else {
    $sql = "INSERT INTO $table (id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at";
}
$pdo->prepare($sql)->execute([$id, $name, $json, $now, $now]);
echo json_encode(['saved' => $id, 'savedAt' => $now . 'Z']);
