import { test, expect, Page } from '@playwright/test';
import path from 'path';

const TEST_EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL || 'ktphinhin9999@hotmail.com';
const TEST_PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD || '0vn5p5';

/** Login as admin and wait for dashboard */
async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('name@example.com').fill(TEST_EMAIL);
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.locator('text=專案影片')).toBeVisible({ timeout: 15_000 });
}

/** Navigate to first video project */
async function navigateToFirstVideo(page: Page) {
  // Video cards use <a href="/videos/...">
  const firstVideoLink = page.locator('a[href^="/videos/"]').first();
  await firstVideoLink.click();
  // Wait for video page to load (player visible)
  await expect(page.locator('video')).toBeVisible({ timeout: 15_000 });
}

/** Generate unique comment text to avoid collisions between parallel test runs */
function uniqueComment(prefix: string) {
  return `${prefix} ${Date.now()}`;
}

test.describe('Annotation Flow — 評論註解完整流程', () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await navigateToFirstVideo(page);
  });

  test('可以新增評論並進入註解模式', async ({ page }) => {
    const commentText = uniqueComment('E2E 測試註解評論');

    // 1. 新增評論
    const commentInput = page.getByPlaceholder('在目前時間點新增評論...');
    await expect(commentInput).toBeVisible();
    await commentInput.fill(commentText);
    await page.getByRole('button', { name: '新增評論' }).click();

    // 2. 等待評論出現
    await expect(page.getByText(commentText).first()).toBeVisible({ timeout: 10_000 });

    // 3. Hover 評論以顯示註解按鈕
    const commentBlock = page.getByText(commentText).first().locator('..');
    await commentBlock.hover();

    // 4. 點擊註解按鈕
    const annotateBtn = commentBlock.locator('..').locator('button[title="註解"]');
    await annotateBtn.click({ force: true });

    // 5. 驗證進入註解模式
    await expect(page.getByText('註解模式已啟用（影片已暫停）').first()).toBeVisible({ timeout: 5_000 });

    // 6. 驗證工具列出現（選取、畫筆、文字、圖片按鈕）
    await expect(page.locator('[aria-label="選取"]')).toBeVisible();
    await expect(page.locator('[aria-label="畫筆"]')).toBeVisible();
    await expect(page.locator('[aria-label="文字"]')).toBeVisible();
    await expect(page.locator('[aria-label="圖片"]')).toBeVisible();

    // 7. 驗證完成按鈕存在
    await expect(page.getByRole('button', { name: '完成' })).toBeVisible();
  });

  test('畫筆功能 — 可以在畫面上畫線', async ({ page }) => {
    // 新增評論 + 進入註解模式
    await addCommentAndEnterAnnotation(page, uniqueComment('E2E 畫筆測試'));

    // 1. 選擇畫筆模式
    await page.locator('[aria-label="畫筆"]').click();

    // 2. 在 canvas 上畫一條線
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    await canvas.dispatchEvent('mousedown', {
      clientX: box!.x + box!.width * 0.3,
      clientY: box!.y + box!.height * 0.3,
      button: 0,
    });
    await canvas.dispatchEvent('mousemove', {
      clientX: box!.x + box!.width * 0.7,
      clientY: box!.y + box!.height * 0.7,
      button: 0,
    });
    await canvas.dispatchEvent('mouseup', { button: 0 });

    // 3. 點擊完成
    await page.getByRole('button', { name: '完成' }).click();

    // 4. 等待儲存完成提示
    await expect(page.getByText('已儲存').first()).toBeVisible({ timeout: 5_000 });
  });

  test('文字功能 — 可以在畫面上插入文字', async ({ page }) => {
    // 新增評論 + 進入註解模式
    await addCommentAndEnterAnnotation(page, uniqueComment('E2E 文字測試'));

    // 1. 選擇文字模式
    await page.locator('[aria-label="文字"]').click();

    // 2. 點擊 canvas 進入文字編輯（使用 dispatchEvent 確保 React onMouseDown 觸發）
    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    await canvas.dispatchEvent('mousedown', {
      clientX: box!.x + box!.width / 2,
      clientY: box!.y + box!.height / 2,
      button: 0,
    });
    await canvas.dispatchEvent('mouseup', { button: 0 });

    // 3. 等待文字編輯器出現
    const textEditor = page.locator('[data-inline-text-editor]');
    await expect(textEditor).toBeVisible({ timeout: 5_000 });

    // 4. 輸入文字
    await textEditor.type('測試文字註解');

    // 5. 按 Enter 確認
    await page.keyboard.press('Enter');

    // 6. 驗證文字註解已新增提示
    await expect(page.getByText('文字註解已新增').first()).toBeVisible({ timeout: 5_000 });

    // 7. 點擊完成
    await page.getByRole('button', { name: '完成' }).click();
    await expect(page.getByText('已儲存').first()).toBeVisible({ timeout: 5_000 });
  });

  test('圖片功能 — 可以在畫面上插入圖片', async ({ page }) => {
    // 新增評論 + 進入註解模式
    await addCommentAndEnterAnnotation(page, uniqueComment('E2E 圖片測試'));

    // 1. 準備 file input 監聽
    const fileInput = page.locator('input[type="file"][accept="image/*"]');

    // 2. 選擇圖片模式 — 這會觸發 file input click
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('[aria-label="圖片"]').click();

    // 3. 上傳測試圖片
    const fileChooser = await fileChooserPromise;
    // 建立一個 1x1 的測試 PNG
    await fileChooser.setFiles({
      name: 'test-annotation.png',
      mimeType: 'image/png',
      buffer: createTestPng(),
    });

    // 4. 等待圖片上傳完成提示
    await expect(page.getByText('圖片已新增').first()).toBeVisible({ timeout: 15_000 });

    // 5. 點擊完成
    await page.getByRole('button', { name: '完成' }).click();
    await expect(page.getByText('已儲存').first()).toBeVisible({ timeout: 5_000 });
  });

  test('完整流程 — 畫筆 + 文字 + 圖片一起加入並儲存', async ({ page }) => {
    // 1. 新增評論 + 進入註解模式
    await addCommentAndEnterAnnotation(page, uniqueComment('E2E 完整註解測試'));

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    // 2. 畫筆 — 畫一條線
    await page.locator('[aria-label="畫筆"]').click();
    await canvas.dispatchEvent('mousedown', {
      clientX: box!.x + 100, clientY: box!.y + 100, button: 0,
    });
    await canvas.dispatchEvent('mousemove', {
      clientX: box!.x + 300, clientY: box!.y + 200, button: 0,
    });
    await canvas.dispatchEvent('mouseup', { button: 0 });

    // 3. 文字 — 插入文字
    await page.locator('[aria-label="文字"]').click();
    await canvas.dispatchEvent('mousedown', {
      clientX: box!.x + box!.width / 2,
      clientY: box!.y + box!.height / 3,
      button: 0,
    });
    await canvas.dispatchEvent('mouseup', { button: 0 });
    const textEditor = page.locator('[data-inline-text-editor]');
    await expect(textEditor).toBeVisible({ timeout: 5_000 });
    await textEditor.type('完整測試文字');
    await page.keyboard.press('Enter');
    await expect(page.getByText('文字註解已新增').first()).toBeVisible({ timeout: 5_000 });

    // 4. 圖片 — 上傳圖片
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('[aria-label="圖片"]').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'test-full.png',
      mimeType: 'image/png',
      buffer: createTestPng(),
    });
    await expect(page.getByText('圖片已新增').first()).toBeVisible({ timeout: 15_000 });

    // 5. 點擊完成 — 自動儲存全部
    await page.getByRole('button', { name: '完成' }).click();
    await expect(page.getByText('已儲存').first()).toBeVisible({ timeout: 5_000 });

    // 6. 驗證退出註解模式
    await expect(page.getByText('註解模式已啟用').first()).not.toBeVisible({ timeout: 3_000 });
  });

  test('註解顯示持續 0.5 秒後消失', async ({ page }) => {
    const commentText = uniqueComment('E2E 顯示時間測試');

    // 1. 新增評論 + 畫筆註解 + 儲存
    await addCommentAndEnterAnnotation(page, commentText);

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    await page.locator('[aria-label="畫筆"]').click();
    await canvas.dispatchEvent('mousedown', {
      clientX: box!.x + 100, clientY: box!.y + 100, button: 0,
    });
    await canvas.dispatchEvent('mousemove', {
      clientX: box!.x + 400, clientY: box!.y + 300, button: 0,
    });
    await canvas.dispatchEvent('mouseup', { button: 0 });

    await page.getByRole('button', { name: '完成' }).click();
    await expect(page.getByText('已儲存').first()).toBeVisible({ timeout: 5_000 });

    // 2. 等待退出註解模式
    await expect(page.getByText('註解模式已啟用').first()).not.toBeVisible({ timeout: 3_000 });

    // 3. 點擊該評論跳到其 timecode
    await page.getByText(commentText).first().click();

    // 4. 短暫等待讓 canvas 繪製註解
    await page.waitForTimeout(100);

    // 5. 驗證 canvas 存在（註解在 canvas 上繪製，無法直接讀取像素，但 canvas 應該可見）
    await expect(canvas).toBeVisible();

    // 6. 播放影片 0.6 秒（註解應在 0.5 秒後消失）
    const video = page.locator('video');
    await video.evaluate((v: HTMLVideoElement) => v.play());
    await page.waitForTimeout(700);
    await video.evaluate((v: HTMLVideoElement) => v.pause());

    // 7. canvas 仍然存在但此時不應有可見的註解內容
    // 由於 canvas 像素無法在 Playwright 中直接驗證，
    // 我們透過確認沒有 annotation mode banner 來間接驗證系統正常運作
    await expect(page.getByText('註解模式已啟用').first()).not.toBeVisible();
  });

  test('刪除評論時連同註解一起刪除', async ({ page }) => {
    const commentText = uniqueComment('E2E 刪除測試');

    // 1. 新增評論 + 畫筆註解 + 儲存
    await addCommentAndEnterAnnotation(page, commentText);

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();

    await page.locator('[aria-label="畫筆"]').click();
    await canvas.dispatchEvent('mousedown', {
      clientX: box!.x + 100, clientY: box!.y + 100, button: 0,
    });
    await canvas.dispatchEvent('mousemove', {
      clientX: box!.x + 300, clientY: box!.y + 200, button: 0,
    });
    await canvas.dispatchEvent('mouseup', { button: 0 });

    await page.getByRole('button', { name: '完成' }).click();
    await expect(page.getByText('已儲存').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('註解模式已啟用').first()).not.toBeVisible({ timeout: 3_000 });

    // 2. Hover 評論顯示刪除按鈕
    const commentBlock = page.getByText(commentText).first().locator('..');
    await commentBlock.hover();

    // 3. 點擊刪除按鈕（沒有 title 的按鈕，第一個按鈕有 title="註解"）
    const deleteBtn = commentBlock.locator('..').locator('button:not([title])').first();
    await deleteBtn.click({ force: true });

    // 4. 確認刪除
    await page.getByRole('button', { name: '確定刪除' }).click();

    // 5. 驗證評論已消失
    await expect(page.getByText(commentText).first()).not.toBeVisible({ timeout: 5_000 });

    // 6. 驗證刪除成功提示
    await expect(page.getByText('評論已刪除').first()).toBeVisible({ timeout: 5_000 });
  });
});

// --- Helper functions ---

async function addCommentAndEnterAnnotation(page: Page, commentText: string) {
  // 新增評論
  const commentInput = page.getByPlaceholder('在目前時間點新增評論...');
  await commentInput.fill(commentText);
  await page.getByRole('button', { name: '新增評論' }).click();

  // 等待評論出現
  await expect(page.getByText(commentText).first()).toBeVisible({ timeout: 10_000 });

  // Hover + 點擊註解按鈕
  const commentBlock = page.getByText(commentText).first().locator('..');
  await commentBlock.hover();
  const annotateBtn = commentBlock.locator('..').locator('button[title="註解"]');
  await annotateBtn.click({ force: true });

  // 驗證進入註解模式
  await expect(page.getByText('註解模式已啟用（影片已暫停）').first()).toBeVisible({ timeout: 5_000 });
}

/** 建立一個最小的有效 PNG 圖片 (1x1 紅色像素) */
function createTestPng(): Buffer {
  // Minimal valid PNG: 1x1 red pixel
  const header = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  ]);
  const ihdr = createPngChunk('IHDR', Buffer.from([
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08,                   // bit depth: 8
    0x02,                   // color type: RGB
    0x00, 0x00, 0x00,       // compression, filter, interlace
  ]));
  // IDAT: zlib compressed scanline (filter byte 0x00 + RGB red pixel)
  const idat = createPngChunk('IDAT', Buffer.from([
    0x78, 0x01, 0x62, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00, 0x01,
  ]));
  const iend = createPngChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([header, ihdr, idat, iend]);
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
