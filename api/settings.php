<?php
/* ============================================
   Lebenslauf-Rechner — zentrale Einstellungen
   Speichert Vorlagen, Berufe und Gehaltstabellen auf dem Server, damit alle Nutzenden
   mit denselben Einstellungen rechnen. Zugriff nur mit dem Zugangspasswort aus config.php.
   Aufrufe:
     GET  settings.php?action=status  -> {"enabled", "exists", "version", "updatedAt", "adminRequired", "problem"}
     GET  settings.php                -> {"version", "updatedAt", "settings"}           (Passwort nötig)
     GET  settings.php?action=history -> {"current", "versions": [{version, updatedAt, updatedBy, counts}]} (Passwort nötig)
     GET  settings.php?action=version&v=N -> die Version N wie GET settings.php        (Passwort nötig)
     POST settings.php                -> Body {"baseVersion", "settings", "updatedBy"} speichern (Passwort nötig)
   Die Daten liegen in api/data/ (per .htaccess gesperrt, nicht im Git). Frühere Versionen
   werden in api/data/history/ aufbewahrt.
   ============================================ */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function fail($status, $message, $extra = []) {
    http_response_code($status);
    echo json_encode(array_merge(['error' => $message], $extra));
    exit;
}

$configFile = __DIR__ . '/config.php';
$config = is_file($configFile) ? require $configFile : null;
if (!is_array($config)) $config = [];
$password = (string) ($config['password'] ?? '');
$enabled = $password !== '' && $password !== 'ein-langes-zufaelliges-passwort';
$adminPassword = (string) ($config['admin_password'] ?? '');
$dataDir = rtrim($config['data_dir'] ?? (__DIR__ . '/data'), '/');
$file = $dataDir . '/settings.json';
$keepHistory = max(0, (int) ($config['keep_versions'] ?? 30));

function readStore($file) {
    if (!is_file($file)) return null;
    $data = json_decode((string) file_get_contents($file), true);
    return is_array($data) ? $data : null;
}

/** Legt den Datenordner an und sperrt ihn gegen direkten Abruf. */
function ensureDataDir($dir) {
    if (!is_dir($dir . '/history') && !@mkdir($dir . '/history', 0750, true)) return false;
    if (!is_file($dir . '/.htaccess')) @file_put_contents($dir . '/.htaccess', "Require all denied\n");
    if (!is_file($dir . '/index.html')) @file_put_contents($dir . '/index.html', '');
    return is_writable($dir);
}

function checkPassword($expected, $header) {
    $given = $_SERVER[$header] ?? '';
    if (!is_string($given) || !hash_equals($expected, $given)) {
        sleep(1); // bremst das Durchprobieren von Passwörtern
        return false;
    }
    return true;
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

if ($action === 'status' && $method === 'GET') {
    $store = $enabled ? readStore($file) : null;
    echo json_encode([
        'enabled' => $enabled,
        'exists' => $store !== null,
        'version' => $store['version'] ?? 0,
        'updatedAt' => $store['updatedAt'] ?? null,
        'adminRequired' => $adminPassword !== '',
        'problem' => $enabled ? null : (is_file($configFile)
            ? 'In config.php ist kein Zugangspasswort («password») gesetzt. Ohne Passwort werden keine Einstellungen auf dem Server gespeichert.'
            : 'Im Ordner «api» gibt es keine Datei «config.php».'),
    ]);
    exit;
}

if (!$enabled) fail(503, 'Zentrale Einstellungen sind nicht eingerichtet (Zugangspasswort in config.php fehlt).');
if (!checkPassword($password, 'HTTP_X_APP_PASSWORD')) fail(401, 'Falsches Zugangspasswort.');

/** Anzahl Funktionen, Tabellen usw. einer Version (für den Verlauf). */
function countsOf($settings) {
    $out = [];
    foreach (['templates', 'salaryTables', 'categories', 'positions', 'classAdjustments'] as $k) {
        $out[$k] = isset($settings[$k]) && is_array($settings[$k]) ? count($settings[$k]) : 0;
    }
    return $out;
}

if ($action === 'history' && $method === 'GET') {
    $current = readStore($file);
    $versions = [];
    foreach (array_reverse(glob($dataDir . '/history/settings-v*.json') ?: []) as $f) {
        $v = readStore($f);
        if ($v === null) continue;
        $versions[] = ['version' => (int) ($v['version'] ?? 0), 'updatedAt' => $v['updatedAt'] ?? null, 'updatedBy' => $v['updatedBy'] ?? '', 'counts' => countsOf($v['settings'] ?? [])];
    }
    // Die aktuelle Version steht immer zuoberst, auch wenn der Verlauf ausgeschaltet ist
    if ($current !== null && (empty($versions) || $versions[0]['version'] !== (int) $current['version'])) {
        array_unshift($versions, ['version' => (int) $current['version'], 'updatedAt' => $current['updatedAt'] ?? null, 'updatedBy' => $current['updatedBy'] ?? '', 'counts' => countsOf($current['settings'] ?? [])]);
    }
    echo json_encode(['current' => $current ? (int) $current['version'] : 0, 'versions' => $versions]);
    exit;
}

if ($action === 'version' && $method === 'GET') {
    $v = (int) ($_GET['v'] ?? 0);
    if ($v <= 0) fail(400, 'Ungültige Version.');
    $store = readStore(sprintf('%s/history/settings-v%05d.json', $dataDir, $v));
    if ($store === null) { $cur = readStore($file); if ($cur && (int) $cur['version'] === $v) $store = $cur; }
    if ($store === null) fail(404, 'Diese Version ist nicht mehr vorhanden.');
    echo json_encode($store);
    exit;
}

if ($method === 'GET') {
    $store = readStore($file);
    if ($store === null) fail(404, 'Auf dem Server sind noch keine Einstellungen gespeichert.');
    echo json_encode($store);
    exit;
}

if ($method !== 'POST') fail(405, 'Nur GET und POST erlaubt.');
if ($adminPassword !== '' && !checkPassword($adminPassword, 'HTTP_X_ADMIN_PASSWORD')) {
    fail(403, 'Zum Speichern der zentralen Einstellungen braucht es das Admin-Passwort.');
}

$maxBytes = 5 * 1024 * 1024;
$body = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
if ($body === false || strlen($body) > $maxBytes) fail(413, 'Die Einstellungen sind zu gross (max. 5 MB).');
$data = json_decode($body, true);
$settings = $data['settings'] ?? null;
if (!is_array($settings) || !isset($settings['categories']) || !is_array($settings['categories']) || !isset($settings['templates']) || !is_array($settings['templates'])) {
    fail(400, 'Ungültige Einstellungen.');
}
// Zugangsdaten gehören nie in die zentralen Einstellungen
unset($settings['apiKey'], $settings['password'], $settings['adminPassword']);

if (!ensureDataDir($dataDir)) fail(500, 'Der Ordner für die Einstellungen (api/data) kann nicht angelegt oder beschrieben werden. Bitte Schreibrechte prüfen.');

$lock = fopen($dataDir . '/settings.lock', 'c');
flock($lock, LOCK_EX);
$current = readStore($file);
$currentVersion = (int) ($current['version'] ?? 0);
if ((int) ($data['baseVersion'] ?? -1) !== $currentVersion) {
    flock($lock, LOCK_UN);
    fail(409, 'Die Einstellungen wurden inzwischen von jemand anderem geändert.', ['version' => $currentVersion, 'updatedAt' => $current['updatedAt'] ?? null]);
}

$updatedBy = mb_substr(trim((string) ($data['updatedBy'] ?? '')), 0, 80);
$store = ['version' => $currentVersion + 1, 'updatedAt' => date('c'), 'updatedBy' => $updatedBy, 'settings' => $settings];
$json = json_encode($store, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
$tmp = $file . '.tmp';
if ($json === false || file_put_contents($tmp, $json) === false || !rename($tmp, $file)) {
    flock($lock, LOCK_UN);
    fail(500, 'Die Einstellungen konnten nicht gespeichert werden.');
}
// Frühere Versionen aufbewahren (die ältesten werden gelöscht)
if ($keepHistory > 0) {
    @copy($file, sprintf('%s/history/settings-v%05d.json', $dataDir, $store['version']));
    $old = glob($dataDir . '/history/settings-v*.json') ?: [];
    sort($old);
    foreach (array_slice($old, 0, max(0, count($old) - $keepHistory)) as $f) @unlink($f);
}
flock($lock, LOCK_UN);

echo json_encode(['version' => $store['version'], 'updatedAt' => $store['updatedAt'], 'updatedBy' => $updatedBy]);

