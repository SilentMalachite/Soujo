次: L34 spec-template
前提: L33 済: validateSpec（state.ts）と next check の SPEC 警告・読めない SPEC の警告
確認: templates/SPEC.md に原則と受け入れ基準のキーの形があり、resume が見出し・空行・HTML コメントだけの SPEC を旧テンプレートも含めて未作成とみなすことがテストで通り、CHANGELOG(+ja) に載る
注意: 新テンプレートでも next check が無警告であること（next.test に既存テストあり）。resume の specUnwritten を置き換える。dist は npm run build で更新
effort: medium
