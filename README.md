# 門市排班系統

## 部署到 Netlify

### 方式一：拖拉部署（最簡單）

1. 在自己的電腦上，把這整個資料夾解壓縮
2. 開啟終端機，進入這個資料夾，執行：
   ```
   npm install
   npm run build
   ```
3. 這會產生一個 `dist` 資料夾
4. 到 [Netlify](https://app.netlify.com)，登入後選擇「Add new site」→「Deploy manually」
5. 把整個 `dist` 資料夾拖到上傳區
6. 完成！Netlify 會給你一個網址（例如 `https://xxxx.netlify.app`）

### 方式二：連結 GitHub（之後修改更新更方便）

1. 把這個資料夾整個推到一個新的 GitHub repository
2. 到 Netlify →「Add new site」→「Import an existing project」
3. 選擇你的 GitHub repository
4. Build command 填：`npm run build`
5. Publish directory 填：`dist`
6. 點「Deploy site」

之後每次更新程式碼推到 GitHub，Netlify 會自動重新部署。

## 注意事項

- 這是展示版，所有資料（員工、排班、填假等）都存在瀏覽器記憶體中，重新整理頁面會清空
- 帳號密碼寫在 `src/App.jsx` 的 `ACCOUNTS` 常數裡，要修改需重新編輯程式碼並重新部署
- 員工登入是「員工編號 + 自設密碼」，密碼設定後也只存在當次瀏覽器記憶體
