# MCPサーバー 受け入れ確認手順書（実機）

| バージョン | 日付 | 内容 |
|---|---|---|
| 1.0 | 2026-10-11 | 新規作成 |

自動テストで確認済みの項目（AC-2・4・5・6・7・9、AC-1の401/メタデータ、AC-8の注釈とtable enum）に加えて、
**実際のClaudeを介した確認が必要なもの（AC-1の接続、AC-3、AC-8の確認プロンプト）**をここで行う。

## 0. 事前準備（ユーザー作業・初回のみ）

Supabase ダッシュボード（プロジェクト `swncmbsamxoyjeojwbyc`）での設定。画面の文言はバージョンにより多少異なる。

1. **JWT署名鍵を非対称鍵へ移行する**
   - Project Settings > JWT Keys（Signing Keys）で、ES256（推奨）の鍵を作成し、現在の署名鍵に切り替える。
   - 既存のPWAのログインは、切り替え後も引き続き使える（セッションは更新時に新しい鍵のトークンになる）。
   - **移行後に、PWAへ今まで通りログインできることを確認する**（確認できるまで次へ進まない）。
2. **OAuth Server を有効化する**（2026年10月時点でベータ）
   - Authentication > OAuth Server を有効にする。
   - 「動的なクライアント登録(Dynamic client registration)」を**ON**にする。
   - Authorization Path（同意画面のパス）を `/oauth-consent.html` にする。
3. **Site URL を確認する**
   - Authentication > URL Configuration の Site URL が `https://mystear7782.github.io`（末尾スラッシュなし）であること。
   - 同意画面のURLは「Site URL + `/oauth-consent.html`」になる。

## 1. AC-1: 認証・接続（スマホのClaude）

前提: §0が完了し、`oauth-consent.html` が GitHub Pages に公開済み（`https://mystear7782.github.io/oauth-consent.html` を開くと「認可リクエストのID(authorization_id)がありません」と表示される）、`supabase functions deploy mcp` 済み。

1. Claude（Web/スマホアプリ）> 設定 > コネクタ > カスタムコネクタを追加。URL: `https://swncmbsamxoyjeojwbyc.supabase.co/functions/v1/mcp`
2. 同意画面（Workout tracker）が開く。未ログインならログインする。
3. 要求元アプリ名が「Claude」系であること、戻り先が `https://claude.ai/...` であることを確認して「許可する」。
4. Claudeに戻り、コネクタが接続済みになる。

| 確認項目 | 期待結果 | 結果 |
|---|---|---|
| 手順1〜4で接続できる | 接続済みになり、ツール一覧が表示される | |
| 「拒否」を選ぶ | 接続されず、エラーまたは未接続のままになる | |
| ダッシュボード > Authentication > OAuth Apps にClaudeが登録されている | 登録されている | |

## 2. AC-3: 食事の記録

Claudeのチャットで、コネクタを有効にして次のように伝える。

> 今日の朝ごはん: 鯖缶150g、豆腐160g、納豆1パック

| 確認項目 | 期待結果 | 結果 |
|---|---|---|
| Claudeが `log_meal` を呼ぶ | 日付が**今日（日本時間）**、区分が「朝」、PFCが推定値で渡される | |
| meal_logs に朝の行が**1つ**追加される | PWAの「食事記録」を開き直すと1件増えている（アプリを前面に戻すだけでは更新されない場合がある。食事記録ページを開き直す） | |
| `calories_kcal` が P×4+F×9+C×4 と一致する | PWAの表示カロリー = P×4+F×9+C×4 | |
| 同じ内容をもう一度頼む（2分以内） | 行が増えない（Claudeが「既に記録済み」と返す） | |

## 3. AC-8: 更新・削除の前に確認を求める

> 今日の朝の食事記録を、たんぱく質40gに修正して

> さっき追加した体重の記録を削除して

| 確認項目 | 期待結果 | 結果 |
|---|---|---|
| 更新前にClaudeが確認を求める | 変更内容を示して「実行してよいか」を聞いてくる（または、Claudeの承認ダイアログが出る） | |
| 削除前にClaudeが確認を求める | 削除対象を示して確認してくる（または承認ダイアログが出る） | |
| 許可すると実行される | PWAに反映される | |
| 6テーブル以外（例: 「ユーザー一覧を取得して」）は実行できない | ツール側でエラーになる（自動テストで確認済み） | |

## 4. その他の動作確認（任意）

| 操作（Claudeへの依頼） | 期待結果 |
|---|---|
| 「先週の食事を日別に集計して」 | `get_meal_summary` の結果が表示される |
| 「ベンチプレスを60kgで10回、今日記録して」 | `log_workout_set` で記録され、PWAの種目詳細に反映される |
| 「存在しない種目（例: ほげほげ）で記録して」 | エラーに候補の種目名が含まれ、Claudeが言い直す |
| 「この種目の履歴を見せて」 | `get_exercise_history` の結果が表示される |

## 5. Claude Code から接続する場合（参考・結果を報告）

Claude Code は、ポートが毎回変わる `http://localhost:<port>/callback` をリダイレクト先に使う。一方Supabaseのリダイレクト先は**完全一致のみ**なので、DCRでの接続に失敗する可能性がある。

```bash
claude mcp add --transport http workout-tracker https://swncmbsamxoyjeojwbyc.supabase.co/functions/v1/mcp
```

接続できたか、どのエラーが出たかを記録する（接続できない場合の代替策は、結果を見て相談する）。
