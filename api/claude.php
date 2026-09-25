<?php
/* ============================================
   Lebenslauf-Rechner — Server-Weiterleitung zur Claude API
   Hält den Anthropic API-Schlüssel auf dem Server, damit er nicht im Browser liegt.
   Einrichtung: config.sample.php nach config.php kopieren und ausfüllen (siehe README).
   Aufrufe:
     GET  claude.php/status        -> {"configured": bool, "passwordRequired": bool, "problem": string|null}
     POST claude.php/v1/messages   -> wird an die Claude API weitergeleitet
   ============================================ */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function fail($status, $type, $message) {
    http_response_code($status);
    echo json_encode(['type' => 'error', 'error' => ['type' => $type, 'message' => $message]]);
    exit;
}

$configFile = __DIR__ . '/config.php';
$config = is_file($configFile) ? require $configFile : null;
$configured = is_array($config) && !empty($config['api_key']) && $config['api_key'] !== 'sk-ant-...';

/** Grund, warum der Server nicht eingerichtet ist (ohne den Schlüssel preiszugeben). */
function configProblem($configFile, $config) {
    if (!is_file($configFile)) {
        $similar = array_values(array_filter(scandir(__DIR__) ?: [], function ($f) {
            return stripos($f, 'config') === 0 && $f !== 'config.sample.php' && $f !== 'config.php';
        }));
        if ($similar) return 'Die Datei heisst nicht genau «config.php», gefunden: ' . implode(', ', $similar) . '. Bitte umbenennen (Dateiendungen im Explorer/Finder einblenden).';
        if (is_file(dirname(__DIR__) . '/config.php')) return 'config.php liegt im Hauptordner. Sie muss in den Ordner «api» (neben claude.php).';
        $sample = @file_get_contents(__DIR__ . '/config.sample.php');
        if ($sample !== false && strpos($sample, "'sk-ant-...'") === false) return 'Der Schlüssel wurde in config.sample.php eingetragen. Diese Datei bitte als «config.php» speichern bzw. umbenennen.';
        return 'Im Ordner «api» gibt es keine Datei «config.php».';
    }
    if (!is_array($config)) return 'config.php gibt keine Einstellungen zurück. Die Datei muss mit «<?php return [» beginnen, siehe config.sample.php.';
    if (!array_key_exists('api_key', $config)) return 'In config.php fehlt der Eintrag «api_key».';
    if ($config['api_key'] === '' || $config['api_key'] === 'sk-ant-...') return 'In config.php ist bei «api_key» noch kein Schlüssel eingetragen.';
    return null;
}
$path = $_SERVER['PATH_INFO'] ?? '';

if ($path === '/status' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode([
        'configured' => $configured,
        'passwordRequired' => $configured && !empty($config['password']),
        'problem' => $configured ? null : configProblem($configFile, $config),
        'keyFormatOk' => $configured ? strpos($config['api_key'], 'sk-ant-') === 0 : null,
    ]);
    exit;
}
if (!$configured) fail(503, 'api_error', 'Der Server ist nicht eingerichtet (config.php fehlt).');
if ($path !== '/v1/messages') fail(404, 'not_found_error', 'Unbekannter Pfad.');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405, 'invalid_request_error', 'Nur POST erlaubt.');

// Zugangspasswort prüfen (verhindert, dass Dritte den Schlüssel über diese Seite nutzen)
if (!empty($config['password'])) {
    $given = $_SERVER['HTTP_X_APP_PASSWORD'] ?? '';
    if (!is_string($given) || !hash_equals((string) $config['password'], $given)) {
        sleep(1); // bremst das Durchprobieren von Passwörtern
        fail(401, 'authentication_error', 'Falsches Zugangspasswort.');
    }
}

$maxBytes = (int) ($config['max_request_mb'] ?? 32) * 1024 * 1024;
$body = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
if ($body === false || strlen($body) > $maxBytes) fail(413, 'request_too_large', 'Die Datei ist zu gross.');
$data = json_decode($body, true);
if (!is_array($data)) fail(400, 'invalid_request_error', 'Ungültige Anfrage.');

$allowed = $config['allowed_models'] ?? ['claude-opus-5', 'claude-sonnet-5'];
if (!in_array($data['model'] ?? '', $allowed, true)) fail(400, 'invalid_request_error', 'Dieses Modell ist auf dem Server nicht freigegeben.');

$headers = [
    'content-type: application/json',
    'x-api-key: ' . $config['api_key'],
    'anthropic-version: ' . ($_SERVER['HTTP_ANTHROPIC_VERSION'] ?? '2023-06-01'),
];
if (!empty($_SERVER['HTTP_ANTHROPIC_BETA'])) $headers[] = 'anthropic-beta: ' . $_SERVER['HTTP_ANTHROPIC_BETA'];

$upstream = rtrim($config['upstream'] ?? 'https://api.anthropic.com', '/') . '/v1/messages';
if (!empty($_SERVER['QUERY_STRING'])) $upstream .= '?' . $_SERVER['QUERY_STRING'];

$ch = curl_init($upstream);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $body,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_TIMEOUT => 600,
]);
$response = curl_exec($ch);
if ($response === false) {
    $err = curl_error($ch);
    curl_close($ch);
    fail(502, 'api_error', 'Claude API nicht erreichbar: ' . $err);
}
$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

http_response_code($status);
echo $response;
