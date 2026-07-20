// verification_config.pb.js
// Configures SMTP + the verification email template for hosted SaaS. Runs AFTER
// e.next() so collections/migrations exist. SaaS-only: a self-hosted instance
// (SELF_HOSTED=true) has no email gate, so this is a no-op there. Idempotent —
// safe to re-run on every boot.
onBootstrap((e) => {
  e.next();

  if ($os.getenv("SELF_HOSTED") === "true") {
    return; // verification is a SaaS-only feature
  }

  const host = $os.getenv("SMTP_HOST");
  if (!host) {
    $app.logger().warn("verification_config: SMTP_HOST unset — SaaS verification emails cannot be sent");
    return;
  }

  const settings = $app.settings();
  settings.smtp.enabled = true;
  settings.smtp.host = host;
  const smtpPort = parseInt($os.getenv("SMTP_PORT") || "587", 10);
  settings.smtp.port = Number.isNaN(smtpPort) ? 587 : smtpPort;
  settings.smtp.username = $os.getenv("SMTP_USERNAME");
  settings.smtp.password = $os.getenv("SMTP_PASSWORD");
  settings.smtp.tls = $os.getenv("SMTP_TLS") === "true";

  settings.meta.senderName = $os.getenv("SMTP_FROM_NAME") || "readmepls";
  settings.meta.senderAddress = $os.getenv("SMTP_FROM") || "no-reply@example.com";
  // Mail links resolve against the SvelteKit origin, not the PB admin UI.
  settings.meta.appURL = $os.getenv("ORIGIN") || settings.meta.appURL;

  $app.save(settings);

  // Point the verification email at our SvelteKit /verify route (default links
  // to the PB admin UI confirm page).
  const users = $app.findCollectionByNameOrId("users");
  users.verificationTemplate.subject = "verify your readmepls email";
  users.verificationTemplate.body =
    "<p>hey — one tap to start reading.</p>" +
    '<p><a href="{APP_URL}/verify?token={TOKEN}">verify my email</a></p>' +
    "<p>if you didn't sign up, ignore this.</p>";
  $app.save(users);
});
