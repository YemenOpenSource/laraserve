const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { triggerError } = require("../../utils");

function isMkcertInstalled() {
  try {
    execSync("which mkcert", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getMkcertPath() {
  return "/usr/local/bin/mkcert";
}

function downloadMkcert() {
  const url = `https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-linux-amd64`;
  const mkcertPath = getMkcertPath();
  const tempPath = "/tmp/mkcert";

  console.log(`   Downloading mkcert v1.4.4...`);

  try {
    const dir = path.dirname(mkcertPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    execSync(`curl -Lo "${tempPath}" "${url}"`, { stdio: "inherit" });
    fs.chmodSync(tempPath, 0o755);

    if (fs.existsSync(mkcertPath)) {
      fs.unlinkSync(mkcertPath);
    }

    fs.renameSync(tempPath, mkcertPath);
    fs.chmodSync(mkcertPath, 0o755);

    console.log(`   ✓ mkcert installed`);
    return true;
  } catch (error) {
    triggerError(`Failed to download mkcert: ${error.message}`);
  }
}

function installMkcert() {
  if (isMkcertInstalled()) {
    console.log("   ✓ mkcert already installed");
    return true;
  }

  return downloadMkcert();
}

function getUserHome() {
  if (process.env.SUDO_USER) {
    return path.join("/home", process.env.SUDO_USER);
  }
  return process.env.HOME || "/root";
}

function getActualUser() {
  return process.env.SUDO_USER || process.env.USER || "root";
}

function runMkcertAsUser(args) {
  const mkcertPath = getMkcertPath();
  const userHome = getUserHome();
  const user = getActualUser();

  return execSync(`"${mkcertPath}" ${args}`, {
    stdio: "inherit",
    env: {
      ...process.env,
      HOME: userHome,
      USER: user,
    },
  });
}

function setCertificatePermissions(certDir, webUser) {
  try {
    execSync(`setfacl -R -m u:${webUser}:rX "${certDir}"`, { stdio: "ignore" });
    execSync(`setfacl -R -d -m u:${webUser}:rX "${certDir}"`, {
      stdio: "ignore",
    });
    console.log(`   ✓ Set ACL permissions for ${webUser}`);
  } catch (error) {
    console.log("   ⚠ ACL not available, falling back to chmod");

    const certFile = path.join(certDir, "*.pem");
    const keyFile = path.join(certDir, "*-key.pem");

    try {
      execSync(`chmod 644 "${certFile}"`, { stdio: "ignore" });
      execSync(`chmod 640 "${keyFile}"`, { stdio: "ignore" });
      execSync(`chmod 755 "${certDir}"`, { stdio: "ignore" });
    } catch {
      console.log("   ⚠ Could not set certificate permissions");
    }
  }
}

function setupSSL(domain) {
  console.log("\n🔒 Setting up SSL certificates...");

  if (!installMkcert()) {
    triggerError("Failed to install mkcert");
  }

  console.log("   Installing CA as trusted root...");

  try {
    runMkcertAsUser("-install");
    console.log("   ✓ CA certificate installed");
  } catch (error) {
    console.log("   ⚠ CA installation may have failed, continuing...");
  }

  const certDir = `/etc/ssl/${domain}`;

  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  console.log(`   Generating certificate for ${domain}...`);

  try {
    runMkcertAsUser(
      `-cert-file "${path.join(
        certDir,
        `${domain}.pem`
      )}" -key-file "${path.join(certDir, `${domain}-key.pem`)}" ${domain}`
    );

    console.log(`   ✓ Certificate generated`);

    const webUser = "www-data";
    setCertificatePermissions(certDir, webUser);

    console.log(`   ✓ Certificate permissions configured for ${webUser}`);
  } catch (error) {
    triggerError(`Failed to generate certificate: ${error.message}`);
  }

  console.log("   ✓ SSL setup completed");

  return {
    certFile: path.join(certDir, `${domain}.pem`),
    keyFile: path.join(certDir, `${domain}-key.pem`),
  };
}

module.exports = {
  setupSSL,
  isMkcertInstalled,
  installMkcert,
  downloadMkcert,
  setCertificatePermissions,
};
