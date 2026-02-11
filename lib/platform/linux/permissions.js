const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { triggerError } = require("../../utils");

function getActualUser() {
  return process.env.SUDO_USER || process.env.USER || "root";
}

function getUserHome() {
  if (process.env.SUDO_USER) {
    return path.join("/home", process.env.SUDO_USER);
  }
  return process.env.HOME || "/root";
}

function isAclAvailable() {
  try {
    execSync("which setfacl", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function fixPermissions(docRoot, server) {
  console.log("\n🔐 Setting up permissions...");

  const absolutePath = path.resolve(docRoot);

  if (!fs.existsSync(absolutePath)) {
    triggerError(`Document root does not exist: ${absolutePath}`);
    process.exit(1);
  }

  const actualUser = getActualUser();
  console.log(`   Actual user: ${actualUser}`);

  await fixLinuxPermissions(absolutePath, actualUser, server);
}

async function fixLinuxPermissions(absolutePath, actualUser, server) {
  try {
    console.log(`   Setting ownership to ${actualUser}...`);
    execSync(`chown -R "${actualUser}:www-data" "${absolutePath}"`, {
      stdio: "inherit",
    });

    if (isAclAvailable()) {
      await fixLinuxACL(absolutePath, actualUser);
    } else {
      console.log("   ⚠ ACL not available, using chmod fallback");
      fallbackChmod(absolutePath);
    }

    handleLaravelDirectories(absolutePath);

    console.log("   ✓ Permissions configured successfully");
    console.log(`   ✓ Owner: ${actualUser}`);
  } catch (error) {
    console.log(`   ⚠ Permission setup warning: ${error.message}`);
  }
}

async function fixLinuxACL(path, actualUser) {
  const ora = (await import("ora")).default;
  const spinner = ora("Setting ACL permissions").start();

  try {
    execSync(
      `setfacl -R \
      -m u::rwx,g::rwx,o::rx \
      -m u:${actualUser}:rwx \
      -m g:www-data:rwx \
      "${path}"`,
      { stdio: "ignore" }
    );

    execSync(
      `setfacl -R -d \
      -m u::rwx,g::rwx,o::rx \
      -m u:${actualUser}:rwx \
      -m g:www-data:rwx \
      "${path}"`,
      { stdio: "ignore" }
    );

    spinner.succeed("Linux ACL permissions set");
  } catch (e) {
    spinner.fail(`ACL failed: ${e.message}`);
  }
}

function fallbackChmod(absolutePath) {
  try {
    execSync(`find "${absolutePath}" -type d -exec chmod 755 {} +`, {
      stdio: "ignore",
    });

    execSync(`find "${absolutePath}" -type f -exec chmod 644 {} +`, {
      stdio: "ignore",
    });

    console.log("   ✓ Basic chmod permissions set");
  } catch (error) {
    triggerError(`   ⚠ chmod fallback failed: ${error.message}`);
  }
}

function handleLaravelDirectories(absolutePath) {
  const directories = [
    { path: path.join(absolutePath, "storage"), name: "storage" },
    {
      path: path.join(absolutePath, "bootstrap", "cache"),
      name: "bootstrap/cache",
    },
  ];

  directories.forEach(({ path: dirPath, name }) => {
    if (!fs.existsSync(dirPath)) return;

    console.log(`   Setting ${name} directory permissions...`);

    try {
      if (isAclAvailable()) {
        // Set ACL permissions
        execSync(`setfacl -R -m u::rwx,g::rwx,o::rx "${dirPath}"`, {
          stdio: "ignore",
        });
        execSync(`setfacl -R -d -m u::rwx,g::rwx,o::rx "${dirPath}"`, {
          stdio: "ignore",
        });
        execSync(`chmod g+s "${dirPath}"`, { stdio: "ignore" });
        console.log(`   ✓ ${name} ACL permissions set`);
      } else {
        // Fallback to chmod
        execSync(`chmod -R 775 "${dirPath}"`, { stdio: "ignore" });
        console.log(`   ✓ ${name} permissions set with chmod`);
      }
    } catch (err) {
      console.warn(`   ⚠ Failed to set ACL for ${name}, falling back to chmod`);
      execSync(`chmod -R 775 "${dirPath}"`, { stdio: "ignore" });
    }
  });
}

module.exports = {
  fixPermissions,
  getActualUser,
  getUserHome,
};
