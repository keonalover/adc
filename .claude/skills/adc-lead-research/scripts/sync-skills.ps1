param(
    [switch]$Check
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$Utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)

function Read-Utf8Text {
    param([string]$Path)
    return [System.IO.File]::ReadAllText($Path, $Utf8Strict)
}

function Write-Utf8NoBom {
    param(
        [string]$Path,
        [string]$Content
    )
    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

function Test-ByteEqual {
    param(
        [string]$LeftPath,
        [string]$RightPath
    )
    if (-not (Test-Path -LiteralPath $LeftPath) -or -not (Test-Path -LiteralPath $RightPath)) {
        return $false
    }
    $left = [System.IO.File]::ReadAllBytes($LeftPath)
    $right = [System.IO.File]::ReadAllBytes($RightPath)
    if ($left.Length -ne $right.Length) {
        return $false
    }
    for ($i = 0; $i -lt $left.Length; $i++) {
        if ($left[$i] -ne $right[$i]) {
            return $false
        }
    }
    return $true
}

function Get-SkillDescription {
    param([string]$SkillText)
    $lines = $SkillText -split "`r?`n"
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^description:\s*>-") {
            $parts = New-Object System.Collections.Generic.List[string]
            for ($j = $i + 1; $j -lt $lines.Count; $j++) {
                if ($lines[$j] -match "^\S" -or $lines[$j] -eq "---") {
                    break
                }
                $part = $lines[$j].Trim()
                if ($part) {
                    $parts.Add($part)
                }
            }
            return (($parts -join " ") -replace "\s+", " ").Trim()
        }
        if ($lines[$i] -match "^description:\s*(.+)$") {
            return $Matches[1].Trim()
        }
    }
    throw "Could not find description in SKILL.md."
}

function Get-InvocationLine {
    param([string]$SkillText)
    $lines = $SkillText -split "`r?`n"
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ($trimmed -match "^python\s+\.claude/skills/adc-lead-research/scripts/build-lead-list\.py\s+<qualified\.json>\s+outreach-run$") {
            return $trimmed
        }
    }
    throw "Could not find exact script invocation line in SKILL.md."
}

function Get-AgentsText {
    param(
        [string]$ExistingText,
        [string]$Description,
        [string]$Invocation
    )
    $begin = "<!-- BEGIN SKILL: adc-lead-research -->"
    $end = "<!-- END SKILL: adc-lead-research -->"
    $nl = if ($ExistingText -match "`r`n") { "`r`n" } else { "`n" }
    $block = @(
        $begin,
        "## adc-lead-research",
        "When to use: $Description",
        $Invocation,
        $end
    ) -join $nl

    $pattern = "(?s)<!-- BEGIN SKILL: adc-lead-research -->.*?<!-- END SKILL: adc-lead-research -->"
    if ($ExistingText -match $pattern) {
        return [regex]::Replace($ExistingText, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $block })
    }

    if ([string]::IsNullOrEmpty($ExistingText)) {
        return $block + $nl
    }
    $separator = if ($ExistingText.EndsWith("`r`n") -or $ExistingText.EndsWith("`n")) { $nl } else { $nl + $nl }
    return $ExistingText + $separator + $block + $nl
}

$skillDir = Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)
$repoRoot = Resolve-Path -LiteralPath (Join-Path $skillDir "..\..\..")
$canonicalPath = Join-Path $skillDir "SKILL.md"
$codexPath = Join-Path $repoRoot ".codex\skills\adc-lead-research\SKILL.md"
$agentsPath = Join-Path $repoRoot "AGENTS.md"

$canonicalText = Read-Utf8Text $canonicalPath
$description = Get-SkillDescription $canonicalText
$invocation = Get-InvocationLine $canonicalText
$existingAgentsText = if (Test-Path -LiteralPath $agentsPath) { Read-Utf8Text $agentsPath } else { "" }
$generatedAgentsText = Get-AgentsText $existingAgentsText $description $invocation

if ($Check) {
    $drift = $false
    if (-not (Test-ByteEqual $canonicalPath $codexPath)) {
        Write-Host "Drift: .codex/skills/adc-lead-research/SKILL.md"
        $drift = $true
    }
    if (-not (Test-Path -LiteralPath $agentsPath) -or (Read-Utf8Text $agentsPath) -ne $generatedAgentsText) {
        Write-Host "Drift: AGENTS.md"
        $drift = $true
    }
    if ($drift) {
        exit 1
    }
    exit 0
}

$codexParent = Split-Path -Parent $codexPath
if (-not (Test-Path -LiteralPath $codexParent)) {
    New-Item -ItemType Directory -Path $codexParent -Force | Out-Null
}
if (-not (Test-ByteEqual $canonicalPath $codexPath)) {
    [System.IO.File]::WriteAllBytes($codexPath, [System.IO.File]::ReadAllBytes($canonicalPath))
}
if (-not (Test-Path -LiteralPath $agentsPath) -or (Read-Utf8Text $agentsPath) -ne $generatedAgentsText) {
    Write-Utf8NoBom $agentsPath $generatedAgentsText
}
