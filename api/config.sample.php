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

    // Maximale Grösse einer Anfrage in MB (PDFs werden Base64-kodiert, ca. +33 %)
    'max_request_mb' => 32,
];
