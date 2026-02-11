const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { triggerError } = require("../../utils");

function isApacheInstalled() {
  try {
    const apachePaths = [
      "/usr/sbin/apache2",
      "/usr/sbin/httpd",
      "/usr/local/apache2/bin/apachectl",
      "/usr/local/bin/apachectl",
    ];

    for (const apachePath of apachePaths) {
      if (fs.existsSync(apachePath)) {
        return true;
      }
    }

    execSync("which apache2", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isNginxInstalled() {
  try {
    const nginxPaths = [
      "/usr/sbin/nginx",
      "/usr/local/sbin/nginx",
      "/usr/local/bin/nginx",
    ];

    for (const nginxPath of nginxPaths) {
      if (fs.existsSync(nginxPath)) {
        return true;
      }
    }

    execSync("which nginx", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function autoDetectServer() {
  const apacheInstalled = isApacheInstalled();
  const nginxInstalled = isNginxInstalled();

  if (apacheInstalled && nginxInstalled) {
    return "nginx";
  }

  if (apacheInstalled) {
    return "apache";
  }

  if (nginxInstalled) {
    return "nginx";
  }

  triggerError(
    "No web server (Apache or Nginx) detected. Please install Apache or Nginx first."
  );
}

async function apachectl(command) {
  try {
    execSync(
      `echo "ServerName localhost" | tee -a /etc/apache2/apache2.conf 2>/dev/null || true`,
      {
        stdio: "ignore",
      }
    );
  } catch {
    console.log("   ⚠ Could not set Apache ServerName");
  }

  try {
    execSync(`apachectl ${command}`, { stdio: "inherit" });
  } catch {
    execSync(`apache2ctl ${command}`, { stdio: "inherit" });
  }
}

async function reloadApache() {
  console.log("   Reloading Apache...");
  await apachectl("graceful");
}

function getApacheSitePath(domain) {
  return `/etc/apache2/sites-available/${domain}.conf`;
}

async function enableApacheSite(domain, ssl) {
  console.log("\n🔧 Enabling Apache site...");
  const configPath = getApacheSitePath(domain);

  if (ssl) {
    try {
      execSync("a2enmod ssl", { stdio: "inherit" });
    } catch {
      console.log("   ⚠ SSL module might already be enabled");
    }
    try {
      execSync(`a2ensite ${path.basename(configPath)}`, { stdio: "inherit" });
    } catch {
      console.log("   ⚠ Site might already be enabled");
    }
  } else {
    try {
      execSync(`a2ensite ${path.basename(configPath)}`, { stdio: "inherit" });
    } catch {
      console.log("   ⚠ Site might already be enabled");
    }
  }

  await reloadApache();
  console.log("   ✓ Apache site enabled");
}

function nginxctl(command) {
  execSync(`nginx ${command}`, { stdio: "inherit" });
}

function getNginxConfigPath(domain) {
  return `/etc/nginx/sites-available/${domain}`;
}

async function restartNginx() {
  console.log("   Restarting Nginx...");
  await nginxctl("-s reload");
}

async function enableNginxSite(domain) {
  console.log("\n🔧 Enabling Nginx site...");

  const configPath = getNginxConfigPath(domain);
  const enabledPath = `/etc/nginx/sites-enabled/${domain}`;

  if (!fs.existsSync(enabledPath)) {
    try {
      fs.symlinkSync(configPath, enabledPath);
      console.log("   ✓ Created symlink to sites-enabled");
    } catch (error) {
      if (error.code !== "EEXIST") {
        triggerError(`   ⚠ Failed to create symlink: ${error.message}`);
      }
    }
  }

  try {
    execSync("nginx -t", { stdio: "inherit" });
  } catch {
    triggerError("Nginx configuration test failed");
  }

  await restartNginx();
  console.log("   ✓ Nginx site enabled");
}

async function enableSite(server, domain, ssl) {
  if (server === "apache") {
    await enableApacheSite(domain, ssl);
  } else if (server === "nginx") {
    await enableNginxSite(domain);
  } else {
    triggerError(`Unsupported server type: ${server}`);
  }
}

module.exports = {
  autoDetectServer,
  enableSite,
};
