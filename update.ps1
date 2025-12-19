$file = "C:\Users\iandc\Desktop\apmanager-students-platform\api-servidor.js"
$lines = Get-Content $file -Encoding UTF8
$output = @()
$skip = $false
$skipCount = 0

for($i = 0; $i -lt $lines.Count; $i++) {
  if($lines[$i] -match 'Intentar varios selectores posibles') {
    $output += "      // Selector exacto de Chrome Recorder"
    $output += "      const guardarBtn = await Promise.race(["
    $output += "        page.waitForSelector('#profile > div > div > div > div.row button', { timeout: 5000 }),"
    $output += "        page.waitForSelector('button:has-text(`"Guardar`")', { timeout: 5000 })"
    $output += "      ]);"
    $output += ""
    $output += "      console.log(' Clic en Guardar...');"
    $output += "      await guardarBtn.click();"
    $output += "      await page.waitForTimeout(2000);"
    $output += "      "
    $output += "      // Click en botón Aceptar (CRÍTICO)"
    $output += "      console.log(' Buscando botón Aceptar...');"
    $output += "      const aceptarBtn = await Promise.race(["
    $output += "        page.waitForSelector('button.btn-danger', { timeout: 5000 }),"
    $output += "        page.waitForSelector('button:has-text(`"Aceptar`")', { timeout: 5000 })"
    $output += "      ]);"
    $output += "      "
    $output += "      console.log(' Clic en Aceptar...');"
    $output += "      await aceptarBtn.click();"
    $output += "      await page.waitForTimeout(2000);"
    $skip = $true
    $skipCount = 0
    continue
  }
  
  if($skip) {
    $skipCount++
    if($skipCount -eq 14) {
      $skip = $false
      $output += "    } catch (e) {"
      $output += "      console.log(' Error:', e.message);"
      $output += "      throw new Error(``No se pudo completar: ${e.message}``);"
      continue
    }
    if($skipCount -le 14) {
      continue
    }
  }
  
  $output += $lines[$i]
}

$output | Set-Content $file -Encoding UTF8
Write-Host " Actualizado"
