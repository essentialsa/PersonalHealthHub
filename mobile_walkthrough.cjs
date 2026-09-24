const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 375px 移动端走查 v2：量化表格滚动性 + 问诊简报 + 数据维护 RecordTable + 附件预览
const outDirName = process.argv[2] || 'before';

const testRecords = [
  { id: "rec_001", date: "2025-10-15", indicatorType: "bloodPressureHigh", value: 128, unit: "mmHg", operationAt: "2025-10-15T08:00:00Z" },
  { id: "rec_002", date: "2025-10-15", indicatorType: "bloodPressureLow", value: 82, unit: "mmHg", operationAt: "2025-10-15T08:00:00Z" },
  { id: "rec_003", date: "2025-10-15", indicatorType: "bloodSugar", value: 5.6, unit: "mmol/L", operationAt: "2025-10-15T08:00:00Z" },
  { id: "rec_004", date: "2025-10-15", indicatorType: "cholesterol", value: 5.2, unit: "mmol/L", operationAt: "2025-10-15T08:00:00Z" },
  { id: "rec_005", date: "2025-10-15", indicatorType: "alt", value: 32, unit: "U/L", operationAt: "2025-10-15T08:00:00Z" },
  { id: "rec_006", date: "2026-01-10", indicatorType: "bloodPressureHigh", value: 132, unit: "mmHg", operationAt: "2026-01-10T08:00:00Z" },
  { id: "rec_007", date: "2026-01-10", indicatorType: "bloodPressureLow", value: 85, unit: "mmHg", operationAt: "2026-01-10T08:00:00Z" },
  { id: "rec_008", date: "2026-01-10", indicatorType: "bloodSugar", value: 5.9, unit: "mmol/L", operationAt: "2026-01-10T08:00:00Z" },
  { id: "rec_009", date: "2026-01-10", indicatorType: "cholesterol", value: 5.5, unit: "mmol/L", operationAt: "2026-01-10T08:00:00Z" },
  { id: "rec_010", date: "2026-01-10", indicatorType: "alt", value: 38, unit: "U/L", operationAt: "2026-01-10T08:00:00Z" },
  { id: "rec_011", date: "2026-04-18", indicatorType: "bloodPressureHigh", value: 125, unit: "mmHg", operationAt: "2026-04-18T08:00:00Z" },
  { id: "rec_012", date: "2026-04-18", indicatorType: "bloodPressureLow", value: 80, unit: "mmHg", operationAt: "2026-04-18T08:00:00Z" },
  { id: "rec_013", date: "2026-04-18", indicatorType: "bloodSugar", value: 6.1, unit: "mmol/L", operationAt: "2026-04-18T08:00:00Z" },
  { id: "rec_014", date: "2026-04-18", indicatorType: "cholesterol", value: 4.9, unit: "mmol/L", operationAt: "2026-04-18T08:00:00Z" },
  { id: "rec_015", date: "2026-04-18", indicatorType: "alt", value: 29, unit: "U/L", operationAt: "2026-04-18T08:00:00Z" },
];

const categories = [
  { id: "cat_blood", name: "血压血糖", items: [
    { id: "bloodPressureHigh", label: "收缩压", unit: "mmHg" },
    { id: "bloodPressureLow", label: "舒张压", unit: "mmHg" },
    { id: "bloodSugar", label: "空腹血糖", unit: "mmol/L" },
  ]},
  { id: "cat_lipid", name: "血脂", items: [
    { id: "cholesterol", label: "总胆固醇", unit: "mmol/L" },
  ]},
  { id: "cat_liver", name: "肝功能", items: [
    { id: "alt", label: "ALT", unit: "U/L" },
  ]},
];

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const tinyPdfBase64 =
  "JVBERi0xLjcKJcK1wrYKJSBXcml0dGVuIGJ5IE11UERGIDEuMjguMgoKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFIvSW5mbzw8L1Byb2R1Y2VyKE11UERGIDEuMjguMik+Pj4+CmVuZG9iagoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1s0IDAgUl0+PgplbmRvYmoKCjMgMCBvYmoKPDwvRm9udDw8L2hlbHYgNSAwIFI+Pj4+CmVuZG9iagoKNCAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDU5NSA4NDJdL1JvdGF0ZSAwL1Jlc291cmNlcyAzIDAgUi9QYXJlbnQgMiAwIFIvQ29udGVudHNbNiAwIFJdPj4KZW5kb2JqCgo1IDAgb2JqCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYS9FbmNvZGluZy9XaW5BbnNpRW5jb2Rpbmc+PgplbmRvYmoKCjYgMCBvYmoKPDwvTGVuZ3RoIDEwMC9GaWx0ZXIvRmxhdGVEZWNvZGU+PgpzdHJlYW0KeNodiTEKw0AMBHu9Qj+wtCfdYQguDG7SBdQZV04OF0mRxu+3MNPs7NCf5iBlSZQbuBk4fjQcn+/Jqhyd14db9VYyiSOX1N5wm5hZheANMbXd8ysoYxZHt33a4klL0IsumrMW5QplbmRzdHJlYW0KZW5kb2JqCgp4cmVmCjAgNwowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNDIgMDAwMDAgbiAKMDAwMDAwMDEyMCAwMDAwMCBuIAowMDAwMDAwMTcyIDAwMDAwIG4gCjAwMDAwMDAyMTMgMDAwMDAgbiAKMDAwMDAwMDMyMCAwMDAwMCBuIAowMDAwMDAwNDA5IDAwMDAwIG4gCgp0cmFpbGVyCjw8L1NpemUgNy9Sb290IDEgMCBSL0lEWzxDMjk3MzVDMzlCQzI4RUMyODlDMkI3NEE3QjAzQzM4OT48RUMzNkQ5NTI0QkJFNEE4QUMzRDI4QkIxN0NDRUNDQ0I+XT4+CnN0YXJ0eHJlZgo1NzgKJSVFT0YK";
const attachments = [
  { id: "att_001", fileName: "化验单.png", fileType: "image/png", fileSize: 100,
    data: `data:image/png;base64,${tinyPngBase64}`, date: "2026-04-18", createdAt: "2026-04-18T08:00:00Z" },
  { id: "att_002", fileName: "报告.pdf", fileType: "application/pdf", fileSize: 852,
    data: `data:application/pdf;base64,${tinyPdfBase64}`, date: "2026-04-18", createdAt: "2026-04-18T09:00:00Z" },
];
const recordsWithAttachment = testRecords.concat([
  { id: "rec_016", date: "2026-04-18", indicatorType: "alt", value: 29, unit: "U/L", operationAt: "2026-04-18T08:00:00Z", attachmentId: "att_001" },
  { id: "rec_017", date: "2026-04-18", indicatorType: "alt", value: 30, unit: "U/L", operationAt: "2026-04-18T09:00:00Z", attachmentId: "att_002" },
]);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  const screenshotDir = path.join(__dirname, 'screenshots', outDirName);
  fs.mkdirSync(screenshotDir, { recursive: true });

  async function capture(viewport, label, fn) {
    const context = await browser.newContext({
      viewport, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', deviceScaleFactor: 2,
    });
    await context.addInitScript(({ records, categories, attachments }) => {
      localStorage.setItem('health_records_v1', JSON.stringify(records));
      localStorage.setItem('health_indicator_categories_v1', JSON.stringify(categories));
      localStorage.setItem('health_attachments_v1', JSON.stringify(attachments));
      localStorage.removeItem('health_last_active_user_v1');
    }, { records: recordsWithAttachment, categories, attachments });
    const page = await context.newPage();
    await page.goto('http://localhost:4173', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2500);
    try {
      await fn(page, label);
    } catch (e) {
      console.error(`✗ ${label}:`, e.message.split('\n')[0]);
      await page.screenshot({ path: path.join(screenshotDir, `ERROR-${label}.png`) });
    }
    await context.close();
  }

  const reportScrollability = async (page, label) => {
    const info = await page.evaluate(() => {
      const doc = document.documentElement;
      const out = { docOverflow: doc.scrollWidth - doc.clientWidth, tables: [] };
      document.querySelectorAll('[data-slot="table-container"]').forEach((el, i) => {
        out.tables.push({
          i,
          scrollable: el.scrollWidth > el.clientWidth + 1,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        });
      });
      return out;
    });
    console.log(`[${label}] docOverflow=${info.docOverflow}`, JSON.stringify(info.tables));
  };

  const mobile = { width: 375, height: 812 };

  await capture(mobile, 'm1-table', async (page, label) => {
    await page.getByRole('tab', { name: '数据列表' }).click();
    await page.waitForTimeout(1500);
    await reportScrollability(page, label);
    await page.screenshot({ path: path.join(screenshotDir, `${label}.png`) });
  });

  await capture(mobile, 'm2-chart', async (page, label) => {
    await page.getByRole('tab', { name: '图表分析' }).click();
    await page.waitForTimeout(2500);
    await reportScrollability(page, label);
    await page.screenshot({ path: path.join(screenshotDir, `${label}.png`) });
    await page.screenshot({ path: path.join(screenshotDir, `${label}-full.png`), fullPage: true });
  });

  await capture(mobile, 'm3-brief', async (page, label) => {
    await page.getByRole('button', { name: '问诊简报' }).click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(screenshotDir, `${label}.png`) });
    await page.screenshot({ path: path.join(screenshotDir, `${label}-full.png`), fullPage: true });
    const copyCount = await page.getByRole('button', { name: /复制|拷贝/ }).count();
    console.log(`[${label}] 复制按钮数:`, copyCount);
  });

  await capture(mobile, 'm4-maintenance', async (page, label) => {
    await page.getByRole('tab', { name: '数据维护' }).click();
    await page.waitForTimeout(1800);
    await reportScrollability(page, label);
    await page.screenshot({ path: path.join(screenshotDir, `${label}.png`) });
    await page.screenshot({ path: path.join(screenshotDir, `${label}-full.png`), fullPage: true });
  });

  await capture(mobile, 'm5-attachment', async (page, label) => {
    await page.getByRole('tab', { name: '数据维护' }).click();
    await page.waitForTimeout(1800);
    // 找到带附件行的回形针图标
    const clip = page.locator('svg.lucide-paperclip').first();
    const found = await clip.count();
    console.log(`[${label}] paperclip icons:`, found);
    if (found > 0) {
      await clip.click({ force: true });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(screenshotDir, `${label}.png`) });
      await page.screenshot({ path: path.join(screenshotDir, `${label}-full.png`), fullPage: true });
    }
  });

  await browser.close();
  console.log('DONE');
})();
