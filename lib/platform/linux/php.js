const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function getPhpVersion() {
  try {
    const output = execSync(
      "php -r 'echo PHP_MAJOR_VERSION.\".\".PHP_MINOR_VERSION;' 2>/dev/null",
      {
        encoding: "utf8",
      }
    );
    return output.trim();
  } catch {
    return null;
  }
}

function getPhpSocketPath(version = null) {
  const detectedVersion = version || getPhpVersion();
  return `/var/run/php/php${detectedVersion}-fpm.sock`;
}

function isPhpInstalled() {
  try {
    execSync("php -v", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getPhpInfo() {
  const version = getPhpVersion();
  const socket = getPhpSocketPath();

  return {
    version,
    socket,
    installed: !!version,
    isTcp: false,
  };
}

function getFastcgiPass() {
  const version = getPhpVersion();
  const socket = getPhpSocketPath(version);
  return `unix:${socket}`;
}

module.exports = {
  getPhpVersion,
  getPhpSocketPath,
  isPhpInstalled,
  getPhpInfo,
  getFastcgiPass,
};
