<?php
/* ============================================
   Lebenslauf-Rechner — Bewerbende in der Datenbank
   Speichert die ausgewerteten Personen (Auswertung, erkannter Text) und die Datei des Lebenslaufs,
   damit sie nach dem Neuladen noch da sind. Zugriff nur mit dem Zugangspasswort.
   Die Tabellen werden beim ersten Aufruf automatisch angelegt.
   Aufrufe:
     GET    candidates.php?action=status        -> {"enabled", "keepDays", "problem"}
     GET    candidates.php                      -> {"candidates": [...], "keepDays"}         (Passwort nötig)
     POST   candidates.php                      -> Body {"candidate": {...}} speichern       (Passwort nötig)
     DELETE candidates.php?id=…                 -> Person samt Datei löschen                  (Passwort nötig)
     GET    candidates.php?action=file&id=…     -> Datei des Lebenslaufs                      (Passwort nötig)
     POST   candidates.php?action=file&id=…     -> Datei speichern (Body = Datei, Header x-file-name)
   Aufbewahrung: Personen, die länger als die eingestellte Anzahl Tage nicht geändert wurden, werden
   samt Datei gelöscht. Die Frist kommt aus den zentralen Einstellungen («retentionDays»), sonst aus
   «keep_days» in config.php (Standard 180, 0 = nie löschen).
   ============================================ */

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function fail($status, $message) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $message]);
    exit;
}
function out($data) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

$configFile = __DIR__ . '/config.php';
$config = is_file($configFile) ? require $configFile : null;
if (!is_array($config)) $config = [];
$password = (string) ($config['password'] ?? '');
$hasPassword = $password !== '' && $password !== 'ein-langes-zufaelliges-passwort';
$db = $config['db'] ?? null;
$hasDb = is_array($db) && (!empty($db['dsn']) || (!empty($db['host']) && !empty($db['name']) && !empty($db['user'])));
$table = preg_replace('/[^a-z0-9_]/i', '', $db['table'] ?? 'lr_candidates');
$files = $table . '_files';
$maxFileMb = max(1, (int) ($config['max_file_mb'] ?? 12));

/**
 * Aufbewahrung in Tagen: zentrale Einstellungen (in der App einstellbar) vor config.php.
 * Zusätzlich pro Status (z. B. Absagen nach 90 Tagen); Status ohne eigene Frist nutzen die allgemeine.
 */
function retention($config) {
    $default = max(0, (int) ($config['keep_days'] ?? 180));
    $byStatus = [];
    $file = rtrim($config['data_dir'] ?? (__DIR__ . '/data'), '/') . '/settings.json';
    if (is_file($file)) {
        $store = json_decode((string) file_get_contents($file), true);
        $days = $store['settings']['retentionDays'] ?? null;
        if (is_numeric($days) && $days >= 0) $default = (int) $days;
        foreach (($store['settings']['retentionByStatus'] ?? []) as $status => $d) {
            if (preg_match('/^[a-z]{2,20}$/', (string) $status) && is_numeric($d) && $d >= 0) $byStatus[$status] = (int) $d;
        }
    }
    return [$default, $byStatus];
}
[$keepDays, $keepByStatus] = retention($config);

function problem($configFile, $hasPassword, $hasDb) {
    if (!is_file($configFile)) return 'Im Ordner «api» gibt es keine Datei «config.php».';
    if (!$hasPassword) return 'In config.php ist kein Zugangspasswort («password») gesetzt. Ohne Passwort werden keine Personendaten gespeichert.';
    if (!$hasDb) return 'In config.php fehlen die Datenbank-Angaben («db»).';
    return null;
}

function connect($db) {
    $dsn = !empty($db['dsn']) ? $db['dsn']
        : sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $db['host'], (int) ($db['port'] ?? 3306), $db['name']);
    return new PDO($dsn, $db['user'] ?? null, $db['password'] ?? null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 10,
    ]);
}

function ensureTables($pdo, $table, $files) {
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $engine = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    $pdo->exec("CREATE TABLE IF NOT EXISTS $table (
        id VARCHAR(40) NOT NULL PRIMARY KEY,
        name VARCHAR(255) NOT NULL DEFAULT '',
        data " . ($mysql ? 'MEDIUMTEXT' : 'TEXT') . " NOT NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT ''
    )$engine");
    // Tabellen aus früheren Versionen: Spalte «status» nachrüsten
    try { $pdo->query("SELECT status FROM $table LIMIT 1"); }
    catch (Exception $e) { $pdo->exec("ALTER TABLE $table ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT ''"); }
    $pdo->exec("CREATE TABLE IF NOT EXISTS $files (
        id VARCHAR(40) NOT NULL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL DEFAULT '',
        mime VARCHAR(100) NOT NULL DEFAULT '',
        size INT NOT NULL DEFAULT 0,
        content " . ($mysql ? 'LONGBLOB' : 'BLOB') . " NOT NULL,
        created_at DATETIME NOT NULL
    )$engine");
}

function validId($id) {
    return is_string($id) && $id !== '' && strlen($id) <= 40 && preg_match('/^[A-Za-z0-9_-]+$/', $id);
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if ($action === 'status' && $method === 'GET') {
    $problem = problem($configFile, $hasPassword, $hasDb);
    if ($problem === null) {
        try { ensureTables(connect($db), $table, $files); }
        catch (Exception $e) { $problem = 'Keine Verbindung zur Datenbank. Bitte die Angaben «db» in config.php prüfen.'; }
    }
    out(['enabled' => $problem === null, 'keepDays' => $keepDays, 'keepByStatus' => (object) $keepByStatus, 'maxFileMb' => $maxFileMb, 'problem' => $problem]);
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
    ensureTables($pdo, $table, $files);
} catch (Exception $e) {
    fail(500, 'Keine Verbindung zur Datenbank. Bitte die Angaben «db» in config.php prüfen.');
}
$now = gmdate('Y-m-d H:i:s');
$id = (string) ($_GET['id'] ?? '');

// --- Datei des Lebenslaufs ---
if ($action === 'file') {
    if (!validId($id)) fail(400, 'Ungültige ID.');
    if ($method === 'GET') {
        $st = $pdo->prepare("SELECT filename, mime, content FROM $files WHERE id = ?");
        $st->execute([$id]);
        $f = $st->fetch();
        if (!$f) fail(404, 'Zu dieser Person ist keine Datei gespeichert.');
        $content = is_resource($f['content']) ? stream_get_contents($f['content']) : $f['content'];
        header('Content-Type: ' . ($f['mime'] ?: 'application/octet-stream'));
        header('Content-Disposition: inline; filename*=UTF-8\'\'' . rawurlencode($f['filename'] ?: 'lebenslauf'));
        header('Content-Length: ' . strlen($content));
        echo $content;
        exit;
    }
    if ($method !== 'POST') fail(405, 'Nur GET und POST erlaubt.');
    $max = $maxFileMb * 1024 * 1024;
    $content = file_get_contents('php://input', false, null, 0, $max + 1);
    if ($content === false || $content === '') fail(400, 'Die Datei ist leer.');
    if (strlen($content) > $max) fail(413, "Die Datei ist zu gross (max. $maxFileMb MB).");
    $name = rawurldecode((string) ($_SERVER['HTTP_X_FILE_NAME'] ?? 'lebenslauf'));
    $name = function_exists('mb_substr') ? mb_substr($name, 0, 255) : substr($name, 0, 255);
    $mime = substr(preg_replace('/[^a-z0-9.+\/-]/i', '', (string) ($_SERVER['CONTENT_TYPE'] ?? 'application/octet-stream')), 0, 100);
    try {
        $st = $pdo->prepare("REPLACE INTO $files (id, filename, mime, size, content, created_at) VALUES (?, ?, ?, ?, ?, ?)");
        $st->bindValue(1, $id);
        $st->bindValue(2, $name);
        $st->bindValue(3, $mime);
        $st->bindValue(4, strlen($content), PDO::PARAM_INT);
        $st->bindValue(5, $content, PDO::PARAM_LOB);
        $st->bindValue(6, $now);
        $st->execute();
    } catch (Exception $e) {
        fail(500, 'Die Datei konnte nicht gespeichert werden (evtl. zu gross für die Datenbank).');
    }
    out(['saved' => $id, 'size' => strlen($content)]);
}

if ($method === 'GET') {
    // Aufbewahrung: pro Status eigene Frist, sonst die allgemeine («neu» gilt auch für Einträge ohne Status)
    $cutoff = function ($days) { return gmdate('Y-m-d H:i:s', time() - $days * 86400); };
    foreach ($keepByStatus as $status => $days) {
        if ($days <= 0) continue;
        $statuses = $status === 'neu' ? ['neu', ''] : [$status];
        $in = implode(',', array_fill(0, count($statuses), '?'));
        $pdo->prepare("DELETE FROM $table WHERE status IN ($in) AND updated_at < ?")->execute(array_merge($statuses, [$cutoff($days)]));
    }
    if ($keepDays > 0) {
        $own = array_keys($keepByStatus);
        if (in_array('neu', $own, true)) $own[] = '';
        if ($own) {
            $in = implode(',', array_fill(0, count($own), '?'));
            $pdo->prepare("DELETE FROM $table WHERE status NOT IN ($in) AND updated_at < ?")->execute(array_merge($own, [$cutoff($keepDays)]));
        } else {
            $pdo->prepare("DELETE FROM $table WHERE updated_at < ?")->execute([$cutoff($keepDays)]);
        }
    }
    $pdo->exec("DELETE FROM $files WHERE id NOT IN (SELECT id FROM $table)");
    $rows = $pdo->query("SELECT c.id, c.data, c.created_at, c.updated_at, f.filename, f.size
        FROM $table c LEFT JOIN $files f ON f.id = c.id ORDER BY c.created_at")->fetchAll();
    $list = [];
    foreach ($rows as $r) {
        $c = json_decode($r['data'], true);
        if (!is_array($c)) continue;
        $c['id'] = $r['id'];
        $c['savedAt'] = str_replace(' ', 'T', $r['updated_at']) . 'Z';
        if (empty($c['createdAt'])) $c['createdAt'] = str_replace(' ', 'T', $r['created_at']) . 'Z';
        $c['hasFile'] = $r['filename'] !== null;
        if ($r['filename'] !== null) { $c['fileName'] = $r['filename']; $c['fileSize'] = (int) $r['size']; }
        $list[] = $c;
    }
    out(['candidates' => $list, 'keepDays' => $keepDays, 'keepByStatus' => (object) $keepByStatus]);
}

if ($method === 'DELETE') {
    if (!validId($id)) fail(400, 'Ungültige ID.');
    $pdo->prepare("DELETE FROM $table WHERE id = ?")->execute([$id]);
    $pdo->prepare("DELETE FROM $files WHERE id = ?")->execute([$id]);
    out(['deleted' => $id]);
}

if ($method !== 'POST') fail(405, 'Nur GET, POST und DELETE erlaubt.');

$maxBytes = 8 * 1024 * 1024;
$body = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
if ($body === false || strlen($body) > $maxBytes) fail(413, 'Die Auswertung ist zu gross (max. 8 MB).');
$data = json_decode($body, true);
$c = $data['candidate'] ?? null;
$cid = is_array($c) ? (string) ($c['id'] ?? '') : '';
if (!validId($cid)) fail(400, 'Ungültige Auswertung.');
unset($c['pdfBase64'], $c['loading'], $c['savedAt'], $c['file'], $c['fileSize']); // Dateien werden separat gespeichert
$json = json_encode($c, JSON_UNESCAPED_UNICODE);
$name = (string) ($c['name'] ?? '');
$name = function_exists('mb_substr') ? mb_substr($name, 0, 255) : substr($name, 0, 255);
$status = preg_match('/^[a-z]{2,20}$/', (string) ($c['status'] ?? '')) ? $c['status'] : '';

if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
    $sql = "INSERT INTO $table (id, name, data, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE name = VALUES(name), data = VALUES(data), updated_at = VALUES(updated_at), status = VALUES(status)";
} else {
    $sql = "INSERT INTO $table (id, name, data, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at, status = excluded.status";
}
$pdo->prepare($sql)->execute([$cid, $name, $json, $now, $now, $status]);
out(['saved' => $cid, 'savedAt' => str_replace(' ', 'T', $now) . 'Z']);
