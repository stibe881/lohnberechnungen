<?php
// Kopieren nach config.php und ausfüllen. config.php NIE ins Git einchecken (steht in .gitignore).
return [
    // Anthropic API-Schlüssel der Organisation (https://platform.claude.com/settings/keys)
    'api_key' => 'sk-ant-...',

    // Zugangspasswort für die App. Ohne Passwort kann jede Person, die die Seite kennt,
    // den Schlüssel auf eure Kosten nutzen – daher unbedingt setzen.
    'password' => 'ein-langes-zufaelliges-passwort',

    // Freigegebene Modelle
    'allowed_models' => ['claude-opus-5', 'claude-sonnet-5'],

    // Zentrale Einstellungen (Vorlagen, Gehaltstabellen) werden mit dem Zugangspasswort geschützt.
    // Optional: zusätzliches Passwort, das nur zum SPEICHERN der zentralen Einstellungen nötig ist.
    // Leer lassen, wenn alle mit Zugangspasswort die Einstellungen ändern dürfen.
    'admin_password' => '',

    // So viele frühere Versionen der Einstellungen werden in api/data/history/ aufbewahrt
    'keep_versions' => 30,

    // Datenbank für die ausgewerteten Personen (damit sie nach dem Neuladen noch da sind).
    // Die Tabelle wird automatisch angelegt. Weglassen, wenn nichts gespeichert werden soll.
    'db' => [
        'host' => 'datenbank-server.example.ch',
        'name' => 'datenbankname',
        'user' => 'benutzername',
        'password' => 'datenbank-passwort',
        // 'port' => 3306,
    ],

    // Personen, die so viele Tage nicht mehr geändert wurden, werden automatisch gelöscht (Datenschutz)
    'keep_days' => 180,

    // Maximale Grösse einer Anfrage in MB (PDFs werden Base64-kodiert, ca. +33 %)
    'max_request_mb' => 32,
];
