const fs = require("fs");
const path = require("path");
const { triggerError } = require("../../utils");

function getHostsFilePath() {
  return "/etc/hosts";
}

function readHostsFile() {
  const hostsPath = getHostsFilePath();
  try {
    return fs.readFileSync(hostsPath, "utf8");
  } catch (error) {
    triggerError(`Failed to read hosts file: ${error.message}`);
  }
}

function writeHostsFile(content) {
  const hostsPath = getHostsFilePath();
  try {
    const tempPath = path.join(path.dirname(hostsPath), ".hosts.tmp");
    fs.writeFileSync(tempPath, content, "utf8");
    fs.renameSync(tempPath, hostsPath);
  } catch (error) {
    triggerError(`Failed to write hosts file: ${error.message}`);
  }
}

function backupHostsFile() {
  const hostsPath = getHostsFilePath();
  const backupPath = `${hostsPath}.backup.${Date.now()}`;
  try {
    fs.copyFileSync(hostsPath, backupPath);
    return backupPath;
  } catch (error) {
    triggerError(`Failed to backup hosts file: ${error.message}`);
  }
}

function hasEntry(domain, hostsContent) {
  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^127\\.0\\.0\\.1\\s+${escapedDomain}\\s*$`, "m");
  const ipv6Pattern = new RegExp(`^::1\\s+${escapedDomain}\\s*$`, "m");
  return pattern.test(hostsContent) || ipv6Pattern.test(hostsContent);
}

function addEntry(domain, ip = "127.0.0.1") {
  const hostsContent = readHostsFile();

  if (hasEntry(domain, hostsContent)) {
    return { success: true, message: `Entry for ${domain} already exists` };
  }

  const newEntry = `${ip} ${domain}`;
  const updatedContent = hostsContent.trim() + "\n" + newEntry + "\n";

  try {
    backupHostsFile();
    writeHostsFile(updatedContent);
    return { success: true, message: `Added ${domain} to hosts file` };
  } catch (error) {
    triggerError(`Failed to add entry to hosts file: ${error.message}`);
  }
}

function removeEntry(domain) {
  const hostsContent = readHostsFile();
  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const entryPattern = new RegExp(
    `^127\\.0\\.0\\.1\\s+${escapedDomain}\\s*$\\n?`,
    "m"
  );
  const ipv6Pattern = new RegExp(`^::1\\s+${escapedDomain}\\s*$\\n?`, "m");

  const updatedContent =
    hostsContent.replace(entryPattern, "").replace(ipv6Pattern, "").trim() +
    "\n";

  if (updatedContent === hostsContent.trim() + "\n") {
    return { success: true, message: `No entry found for ${domain}` };
  }

  try {
    backupHostsFile();
    writeHostsFile(updatedContent);
    return { success: true, message: `Removed ${domain} from hosts file` };
  } catch (error) {
    triggerError(`Failed to remove entry from hosts file: ${error.message}`);
  }
}

module.exports = {
  addEntry,
  removeEntry,
};
