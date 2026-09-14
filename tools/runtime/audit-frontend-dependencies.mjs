#!/usr/bin/env node
// Read the npm bulk advisory endpoint. Fail closed on network/response errors.
// Report matching installed versions separately from application reachability.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(path.join(root, 'frontend/package.json'))
const semver = require('semver')
const lockPath = process.argv[2] || path.join(root,'frontend/package-lock.json')
const outputPath = process.argv[3]
const lock = JSON.parse(fs.readFileSync(lockPath,'utf8'))
const versions = {}
const installed = []
for (const [location, value] of Object.entries(lock.packages || {})) {
  if (!location || !value.version || !location.includes('node_modules/')) continue
  const name = value.name || location.slice(location.lastIndexOf('node_modules/') + 13)
  versions[name] ||= []
  if (!versions[name].includes(value.version)) versions[name].push(value.version)
  installed.push({name,version:value.version,developmentOnly:value.dev === true,location})
}
if (!installed.length) throw new Error('No locked packages found')
const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(versions),signal:AbortSignal.timeout(60000)})
if (!response.ok) throw new Error(`Advisory request failed: HTTP ${response.status}`)
const advisories = await response.json()
if (!advisories || typeof advisories !== 'object' || Array.isArray(advisories)) throw new Error('Invalid advisory response')
const findings = []
for (const entry of installed) {
  for (const advisory of advisories[entry.name] || []) {
    if (!semver.validRange(advisory.vulnerable_versions)) throw new Error(`Invalid range for ${entry.name}`)
    if (semver.satisfies(entry.version, advisory.vulnerable_versions)) findings.push({...entry,severity:advisory.severity,title:advisory.title,url:advisory.url,range:advisory.vulnerable_versions})
  }
}
const result = {checkedAt:new Date().toISOString(),source:'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',lockPath,packageEntries:installed.length,findings,advisories,scope:'Locked package versions, not proof of exploitable application call paths.'}
const text = JSON.stringify(result,null,2)+'\n'
if (outputPath) fs.writeFileSync(outputPath,text)
else process.stdout.write(text)
console.error(`Checked ${installed.length} locked entries; ${findings.length} advisory/version matches (${findings.filter(f=>!f.developmentOnly).length} runtime or shared, ${findings.filter(f=>f.developmentOnly).length} development-only).`)
if (findings.length) process.exitCode=1
