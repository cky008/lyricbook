# 用 0.0.3 现代版完整覆盖仓库

本指南用于把有问题的旧实现完整替换为 React 19 / Vite 8 / TypeScript 7 / Tailwind 4 / Rust 1.98 的 LyricBook 0.0.3。

## 1. 先备份远程历史

```bash
git fetch origin --prune
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
git branch "backup/pre-modern-reset-$STAMP" origin/main
git push origin "backup/pre-modern-reset-$STAMP:backup/pre-modern-reset-$STAMP"
```

## 2. 解压源码到临时位置

不要把 ZIP 直接解压进现有仓库后用 Finder 替换隐藏目录。先解压到单独目录，再用 `rsync` 复制。

```bash
rm -rf /tmp/lyricbook-modern
mkdir -p /tmp/lyricbook-modern
unzip ~/Downloads/lyricbook-v0.0.3-source.zip -d /tmp/lyricbook-modern
```

## 3. 覆盖工作树，但保留 `.git`

在仓库根目录执行：

```bash
cd /Users/iocky/Documents/lyricbook
rsync -a --delete \
  --exclude .git \
  --exclude node_modules \
  --exclude target \
  --exclude dist \
  /tmp/lyricbook-modern/lyricbook-v0.0.3/ ./
```

检查不应出现私人歌词文件：

```bash
git status --short
git diff --name-status
find . -maxdepth 3 \( -name '*歌词本备份*.json' -o -name '*.lyricbook' \)
```

## 4. 使用固定工具链生成锁文件

```bash
nvm install 26.8.1
nvm use 26.8.1
npm install --global npm@12.0.2
rustup toolchain install 1.98.0 --component rustfmt clippy --target wasm32-unknown-unknown
rustup override set 1.98.0
cargo install wasm-pack --version 0.15.0 --locked

npm install
cargo generate-lockfile
```

必须确认下面两个文件存在：

```bash
test -f package-lock.json
test -f Cargo.lock
```

## 5. 完整验证

```bash
npm run build:wasm
npm run check
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
```

## 6. 创建新的初始提交

若要保留当前 Git 历史，只需普通提交。若要重写成一个新的初始提交，应先临时允许 `main` 强制推送，并使用 `--force-with-lease`，不要使用裸 `--force`。

```bash
git add -A
git diff --cached --check
git commit -m "feat: initialize LyricBook 0.0.3 modern stack"
git push --force-with-lease origin main
```

## 7. 重建 develop

```bash
git switch -C develop main
git push --force-with-lease -u origin develop
```

恢复 GitHub Ruleset 后，日常开发在 `develop`，正式发布通过 `develop → main` Pull Request。

## 8. 部署后检查

```text
https://lyricbook.iocky.com/version.json
https://lyricbook.iocky.com/icon-192.png
https://lyricbook.iocky.com/locales/en-US/main.ftl
https://lyricbook.iocky.com/locales/zh-CN/main.ftl
```

`version.json` 应显示 `0.0.3`。若页面仍是旧版，请清理 Cloudflare 缓存和旧 Service Worker 网站数据。
