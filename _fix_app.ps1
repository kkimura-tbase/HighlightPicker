param()
$enc = [System.Text.Encoding]::UTF8
$text = [System.IO.File]::ReadAllText("app.js", $enc)
# Detect line ending used in file
$crlf = $text.Contains("`r`n")
$eol = if ($crlf) { "`r`n" } else { "`n" }
$lines = $text -split "`r?`n"

Write-Host "Total lines: $($lines.Count)"
$fffd = [char]65533
$changedCount = 0

function FixLine($lineNum, $newContent) {
    $idx = $lineNum - 1
    if ($lines[$idx] -ne $newContent) {
        $lines[$idx] = $newContent
        $script:changedCount++
        Write-Host "  Fixed L$lineNum"
    }
}

# --- Verify then fix each garbled line ---

# L169: readingZoneBtn.textContent unclosed string in loadImageFile
# Original: els.readingZoneBtn.textContent = "読み取りエリア持E[FFFD...]E;
if ($lines[168].Contains($fffd) -or ($lines[168] -match 'readingZoneBtn\.textContent.*[^;";]$')) {
    FixLine 169 '        els.readingZoneBtn.textContent = "読み取りエリア設定";'
}

# L174: setStatus("読込完亁E);  UNCLOSED
if ($lines[173].Contains($fffd) -or ($lines[173] -match 'setStatus.*読込完') ) {
    FixLine 174 '      setStatus("読込完了");'
}

# L264: toggleReadingMode ternary, both strings broken
if ($lines[263].Contains($fffd) -or ($lines[263] -match 'readingZoneBtn\.textContent.*\?')) {
    FixLine 264 '    els.readingZoneBtn.textContent = inclusionModeActive ? "エリア設定中" : "読み取りエリア設定";'
}

# L285: setStatus("征...中") - syntactically OK but garbled
if ($lines[284].Contains($fffd) -or ($lines[284] -match 'setStatus.*征')) {
    FixLine 285 '    setStatus("画像クリア");'
}

# L340: setStatus("黁E...検...中") - syntactically OK
if ($lines[339].Contains($fffd)) {
    FixLine 340 '    setStatus("ハイライト検出中");'
}

# L349: setStatus("黁E...なぁE); UNCLOSED
if ($lines[348].Contains($fffd) -or ($lines[348] -match 'setStatus.*黁')) {
    FixLine 349 '      setStatus("ハイライトなし");'
}

# L376: setStatus("翻訳失敗E); UNCLOSED (no FFFD but no closing quote)
if ($lines[375] -match 'setStatus.*翻訳失') {
    FixLine 376 '          setStatus("翻訳失敗");'
}

# L377: alert("OCRは完亁E...E); UNCLOSED
if ($lines[376].Contains($fffd) -or ($lines[376] -match 'alert.*OCRは完')) {
    FixLine 377 '          alert("OCRは完了しましたが、自動翻訳に失敗しました。GASのURLと公開設定を確認してください。");'
}

# L380: setStatus(detectedResults.length ? "抽出...E : "該当...E); BROKEN TERNARY
if ($lines[379].Contains($fffd) -or ($lines[379] -match 'setStatus.*detectedResults.*抽出')) {
    FixLine 380 '      setStatus(detectedResults.length ? "抽出完了" : "該当なし");'
}

# L384: alert("OCRに失敗...E); UNCLOSED
if ($lines[383].Contains($fffd) -or ($lines[383] -match 'alert.*OCRに失敗')) {
    FixLine 384 '      alert("OCRに失敗しました。画像を少し拡大したスクリーンショットで再度お試しください。");'
}

# L793: resultsList innerHTML garbled
if ($lines[792].Contains($fffd) -or ($lines[792] -match 'resultsList\.innerHTML.*黁')) {
    FixLine 793 '      els.resultsList.innerHTML = "<p>ハイライト上の単語が見つかりませんでした</p>";'
}

# L832: setStatus("翻訳URLなぁE); UNCLOSED
if ($lines[831] -match 'setStatus.*翻訳URL') {
    FixLine 832 '      setStatus("翻訳URLなし");'
}

# L879: setStatus("保存完亁E); UNCLOSED
if ($lines[878] -match 'setStatus.*保存完') {
    FixLine 879 '      setStatus("保存完了");'
}

# L882: setStatus("保存失敗E); UNCLOSED
if ($lines[881] -match 'setStatus.*保存失') {
    FixLine 882 '      setStatus("保存失敗");'
}

# L883: alert("保存に失敗...E); UNCLOSED
if ($lines[882] -match 'alert.*保存に失敗') {
    FixLine 883 '      alert("保存に失敗しました。GASのURLと公開設定を確認してください。");'
}

# L983: wordList empty state template literal trailing garble
if ($lines[982] -match 'empty-msg.*保存した単語') {
    $lines[982] = '      els.wordList.innerHTML = `<tr><td colspan="7" class="empty-msg">保存した単語がありません${query ? "(検索結果ゼロ)" : ""}</td></tr>`;'
    $changedCount++
    Write-Host "  Fixed L983"
}

# L1024: quiz template literal garbled labels (search dynamically by content)
for ($i = 1010; $i -lt [Math]::Min(1040, $lines.Count); $i++) {
    if ($lines[$i].Contains($fffd) -and $lines[$i] -match '日本語.*意味') {
        $lines[$i] = '          <strong>日本語の意味</strong>'
        $changedCount++
        Write-Host "  Fixed L$($i+1) (quiz 意味)"
    }
    if ($lines[$i].Contains($fffd) -and $lines[$i] -match '英.*日本語訳') {
        $lines[$i] = '          <strong>英文の日本語訳</strong>'
        $changedCount++
        Write-Host "  Fixed L$($i+1) (quiz 日本語訳)"
    }
}

Write-Host "Line fixes applied: $changedCount"

# ============================================================
# Add delete button to tr.innerHTML in renderWordList
# ============================================================
$trMarker = '        <td class="col-date">${formatDate(item.createdAt)}</td>'
$trIdx = -1
for ($i = 980; $i -lt [Math]::Min(1010, $lines.Count); $i++) {
    if ($lines[$i] -eq $trMarker) {
        $trIdx = $i
        break
    }
}
if ($trIdx -ge 0) {
    # Check if delete button column already added
    if (-not ($lines[$trIdx + 1] -match 'col-actions')) {
        # Insert the delete button line after the date column
        $deleteLine = '        <td class="col-actions"><button class="btn-delete delete-btn" type="button">削除</button></td>'
        $before = $lines[0..$trIdx]
        $after = $lines[($trIdx+1)..($lines.Count - 1)]
        $lines = $before + $deleteLine + $after
        Write-Host "  Added delete button column at L$($trIdx+2)"
    } else {
        Write-Host "  Delete button column already present"
    }
} else {
    Write-Host "  WARNING: Could not find tr date column at expected location"
}

# ============================================================
# Insert clearSavedItems and deleteSavedItem before renderWordList
# ============================================================
$rwlIdx = -1
for ($i = 940; $i -lt [Math]::Min(1010, $lines.Count); $i++) {
    if ($lines[$i] -match '^  function renderWordList\(\)') {
        $rwlIdx = $i
        break
    }
}

if ($rwlIdx -ge 0) {
    # Check if already present
    $alreadyExists = $false
    for ($j = [Math]::Max(0,$rwlIdx-40); $j -lt $rwlIdx; $j++) {
        if ($lines[$j] -match 'async function clearSavedItems') {
            $alreadyExists = $true
            break
        }
    }

    if (-not $alreadyExists) {
        $newFunctions = @(
            '',
            '  async function clearSavedItems() {',
            '    if (!confirm("GASおよびローカルのすべての単語データを削除します。本当によろしいですか？")) return;',
            '    try {',
            '      const endpoint = saveEndpoint();',
            '      if (endpoint) {',
            '        await postToGas(endpoint, { action: "clear" });',
            '      }',
            '      localStorage.removeItem(STORAGE_KEY);',
            '      savedItems = [];',
            '      renderWordList();',
            '      showRandomQuiz(false);',
            '      alert("すべてのデータを消去しました。");',
            '    } catch (error) {',
            '      console.error(error);',
            '      alert("GASのデータ削除に失敗しました。URLを確認してください。");',
            '    }',
            '  }',
            '',
            '  async function deleteSavedItem(id) {',
            '    if (!confirm("この単語を削除しますか？")) return;',
            '    try {',
            '      const endpoint = saveEndpoint();',
            '      if (endpoint) {',
            '        await postToGas(endpoint, { action: "delete", id });',
            '      }',
            '      savedItems = savedItems.filter(item => item.id !== id);',
            '      saveLocalSnapshot(savedItems);',
            '      renderWordList();',
            '      showRandomQuiz(false);',
            '    } catch (error) {',
            '      console.error(error);',
            '      alert("削除に失敗しました。");',
            '    }',
            '  }',
            ''
        )
        $before = $lines[0..($rwlIdx - 1)]
        $after = $lines[$rwlIdx..($lines.Count - 1)]
        $lines = $before + $newFunctions + $after
        Write-Host "  Inserted clearSavedItems and deleteSavedItem ($(  $newFunctions.Count) lines) before renderWordList"
    } else {
        Write-Host "  clearSavedItems already present, skipping"
    }
} else {
    Write-Host "  WARNING: Could not find renderWordList"
}

# ============================================================
# Save with explicit UTF-8 (no BOM)
# ============================================================
$newText = $lines -join $eol
[System.IO.File]::WriteAllText("app.js", $newText, $enc)
Write-Host ""
Write-Host "Done. app.js saved with UTF-8 encoding."
