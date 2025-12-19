$file = "C:\Users\iandc\Desktop\apmanager-students-platform\api-servidor.js"
$content = [System.IO.File]::ReadAllLines($file, [System.Text.Encoding]::UTF8)
$newContent = @()
foreach($line in $content) {
    $line = $line -replace '', '[OK]'
    $line = $line -replace '', '[X]'
    $line = $line -replace '', '[>]'
    $line = $line -replace '', '[MATERIAS]'
    $line = $line -replace '', '[HEADLESS]'
    $line = $line -replace '', '[VISIBLE]'
    $line = $line -replace '', '[NEW]'
    $line = $line -replace '', '[EXPIRED]'
    $line = $line -replace '', '[DEL]'
    $line = $line -replace '', '[RETRY]'
    $line = $line -replace '', '[AUTH]'
    $line = $line -replace '', '[TAB]'
    $line = $line -replace '', '[i]'
    $line = $line -replace '', '[!]'
    $line = $line -replace '', '[DB]'
    $line = $line -replace '', '[TARGET]'
    $line = $line -replace '', '[TIME]'
    $line = $line -replace '', '[#]'
    $line = $line -replace '', '[STOP]'
    $line = $line -replace '', '[LIST]'
    $newContent += $line
}
[System.IO.File]::WriteAllLines($file, $newContent, [System.Text.UTF8Encoding]::new($false))
Write-Host "[OK] Emojis eliminados del archivo"
