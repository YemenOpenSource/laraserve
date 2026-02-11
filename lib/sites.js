const fs = require("fs");
const path = require("path");
const { detectPlatform, Platform } = require("./platform");
const { getPhpVersion } = require("./platform");
const { triggerError } = require("./utils");

const SITES_FILE = path.join(__dirname, "..", "sites.json");

function loadSites() {
  try {
    if (fs.existsSync(SITES_FILE)) {
      return JSON.parse(fs.readFileSync(SITES_FILE, "utf8"));
    }
  } catch (error) {
    triggerError("Failed to load sites file:", error.message);
  }
  return [];
}

function saveSites(sites) {
  fs.writeFileSync(SITES_FILE, JSON.stringify(sites, null, 2), "utf8");
}

function getApacheConfigsDir() {
  const platform = detectPlatform();
  if (platform === Platform.DARWIN) {
    const { execSync } = require("child_process");
    try {
      const brewPrefix = execSync("brew --prefix", { encoding: "utf8" }).trim();
      return path.join(brewPrefix, "etc", "httpd", "users");
    } catch {
      return "/usr/local/etc/httpd/users";
    }
  }
  if (platform === Platform.WINDOWS) {
    return path.join(process.env.ProgramData || "C:\\ProgramData", "Apache", "conf", "sites");
  }
  return "/etc/apache2/sites-available";
}

function getNginxConfigsDir() {
  const platform = detectPlatform();
  if (platform === Platform.DARWIN) {
    const { execSync } = require("child_process");
    try {
      const brewPrefix = execSync("brew --prefix", { encoding: "utf8" }).trim();
      return path.join(brewPrefix, "etc", "nginx", "servers");
    } catch {
      return "/usr/local/etc/nginx/servers";
    }
  }
  if (platform === Platform.WINDOWS) {
    return path.join(process.env.NGINX_PATH || "C:\\nginx", "conf", "sites");
  }
  return "/etc/nginx/sites-available";
}

function getNginxEnabledDir() {
  return "/etc/nginx/sites-enabled";
}

function listSites() {
  console.log("\n📋 Configured Websites\n");
  console.log("━".repeat(80));

  const sites = loadSites();

  if (sites.length === 0) {
    console.log("No websites configured yet.");
    console.log("\nUse: laraserve --domain <domain> --path <path> --server <apache|nginx> [--ssl]");
    return;
  }

  const phpVersion = getPhpVersion();

  console.log("  Domain".padEnd(30) + "Server".padEnd(12) + "SSL".padEnd(8) + "Path");
  console.log("━".repeat(80));

  for (const site of sites) {
    const sslStatus = site.ssl ? "Yes" : "No";
    console.log(
      `  ${site.domain.padEnd(28)} ${site.server.padEnd(10)} ${sslStatus.padEnd(6)} ${site.path}`
    );
  }

  console.log("━".repeat(80));
  console.log(`\nTotal: ${sites.length} website(s)`);

  if (phpVersion) {
    console.log(`PHP: ${phpVersion}`);
  }
}

function findSite(domain) {
  const sites = loadSites();
  return sites.find((site) => site.domain === domain);
}

function removeSite(domain) {
  console.log(`\n🗑️  Removing website: ${domain}\n`);

  const sites = loadSites();
  const siteIndex = sites.findIndex((site) => site.domain === domain);

  if (siteIndex === -1) {
    triggerError(`Website '${domain}' not found.`);
    return 
  }

  const site = sites[siteIndex];

  const platform = detectPlatform();

  try {
    if (site.server === "apache") {
      const configPath = path.join(getApacheConfigsDir(), `${domain}.conf`);
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
        console.log(`   ✓ Removed Apache config: ${configPath}`);
      }

      if (platform === Platform.LINUX) {
        try {
          const { execSync } = require("child_process");
          execSync(`a2dissite ${domain}.conf`, { stdio: "inherit" });
          console.log(`   ✓ Disabled Apache site`);
        } catch (error) {
          console.log(`   ⚠ Could not disable Apache site`);
        }
      }
    } else if (site.server === "nginx") {
      const configPath = path.join(getNginxConfigsDir(), domain);
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
        console.log(`   ✓ Removed Nginx config: ${configPath}`);
      }

      if (platform === Platform.LINUX) {
        const enabledPath = path.join(getNginxEnabledDir(), domain);
        if (fs.existsSync(enabledPath)) {
          fs.unlinkSync(enabledPath);
          console.log(`   ✓ Removed symlink from sites-enabled`);
        }
      }
    }

    sites.splice(siteIndex, 1);
    saveSites(sites);
    console.log(`   ✓ Removed '${domain}' from Laraserve registry`);

    const { removeEntry } = require("./platform");
    try {
      removeEntry(domain);
      console.log(`   ✓ Removed entry from hosts file`);
    } catch {
      console.log(`   ⚠ Could not remove hosts file entry`);
    }

    console.log("\n✅ Website removed successfully!");
    console.log(`\n   Note: The document root directory at '${site.path}' was not deleted.`);
  } catch (error) {
    triggerError(`Failed to remove website: ${error.message}`);
    
  }
}

function saveSite(site) {
  const sites = loadSites();

  const existingIndex = sites.findIndex((s) => s.domain === site.domain);
  if (existingIndex !== -1) {
    sites[existingIndex] = site;
  } else {
    sites.push(site);
  }

  saveSites(sites);
}

function getSite(domain) {
  return findSite(domain);
}

module.exports = {
  listSites,
  removeSite,
  saveSite,
  getSite,
  loadSites,
};
