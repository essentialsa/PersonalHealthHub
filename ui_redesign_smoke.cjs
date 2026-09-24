const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:4173';
const OUT = path.join(__dirname, 'screenshots', 'ui-redesign');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: Boolean(cond), detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

const testRecords = [
  { id: "rec_001", date: "2025-10-15", indicatorType: "bloodPressureHigh", value: 128, unit: "mmHg" },
  { id: "rec_002", date: "2025-10-15", indicatorType: "bloodPressureLow", value: 82, unit: "mmHg" },
  { id: "rec_003", date: "2025-10-15", indicatorType: "bloodSugar", value: 5.6, unit: "mmol/L" },
  { id: "rec_004", date: "2025-10-15", indicatorType: "cholesterol", value: 5.2, unit: "mmol/L" },
  { id: "rec_005", date: "2025-10-15", indicatorType: "triglycerides", value: 1.8, unit: "mmol/L" },
  { id: "rec_006", date: "2025-10-15", indicatorType: "ldl", value: 3.1, unit: "mmol/L" },
  { id: "rec_007", date: "2025-10-15", indicatorType: "hdl", value: 1.4, unit: "mmol/L" },
  { id: "rec_008", date: "2025-10-15", indicatorType: "alt", value: 32, unit: "U/L" },
  { id: "rec_009", date: "2025-10-15", indicatorType: "ast", value: 28, unit: "U/L" },
  { id: "rec_010", date: "2025-10-15", indicatorType: "creatinine", value: 78, unit: "µmol/L" },
  { id: "rec_011", date: "2025-10-15", indicatorType: "bun", value: 5.2, unit: "mmol/L" },
  { id: "rec_012", date: "2025-10-15", indicatorType: "weight", value: 72.5, unit: "kg" },
  { id: "rec_013", date: "2025-10-15", indicatorType: "bmi", value: 23.8, unit: "" },
  { id: "rec_014", date: "2025-10-15", indicatorType: "heartRate", value: 72, unit: "次/分" },
  { id: "rec_015", date: "2026-01-10", indicatorType: "bloodPressureHigh", value: 132, unit: "mmHg" },
  { id: "rec_016", date: "2026-01-10", indicatorType: "bloodPressureLow", value: 85, unit: "mmHg" },
  { id: "rec_017", date: "2026-01-10", indicatorType: "bloodSugar", value: 5.9, unit: "mmol/L" },
  { id: "rec_018", date: "2026-01-10", indicatorType: "cholesterol", value: 5.5, unit: "mmol/L" },
  { id: "rec_019", date: "2026-01-10", indicatorType: "triglycerides", value: 2.1, unit: "mmol/L" },
  { id: "rec_020", date: "2026-01-10", indicatorType: "ldl", value: 3.4, unit: "mmol/L" },
  { id: "rec_021", date: "2026-01-10", indicatorType: "hdl", value: 1.3, unit: "mmol/L" },
  { id: "rec_022", date: "2026-01-10", indicatorType: "alt", value: 38, unit: "U/L" },
  { id: "rec_023", date: "2026-01-10", indicatorType: "ast", value: 31, unit: "U/L" },
  { id: "rec_024", date: "2026-01-10", indicatorType: "creatinine", value: 82, unit: "µmol/L" },
  { id: "rec_025", date: "2026-01-10", indicatorType: "bun", value: 5.8, unit: "mmol/L" },
  { id: "rec_026", date: "2026-01-10", indicatorType: "weight", value: 74.0, unit: "kg" },
  { id: "rec_027", date: "2026-01-10", indicatorType: "bmi", value: 24.3, unit: "" },
  { id: "rec_028", date: "2026-01-10", indicatorType: "heartRate", value: 75, unit: "次/分" },
  { id: "rec_029", date: "2026-04-18", indicatorType: "bloodPressureHigh", value: 125, unit: "mmHg" },
  { id: "rec_030", date: "2026-04-18", indicatorType: "bloodPressureLow", value: 80, unit: "mmHg" },
  { id: "rec_031", date: "2026-04-18", indicatorType: "bloodSugar", value: 5.3, unit: "mmol/L" },
  { id: "rec_032", date: "2026-04-18", indicatorType: "cholesterol", value: 4.9, unit: "mmol/L" },
  { id: "rec_033", date: "2026-04-18", indicatorType: "triglycerides", value: 1.5, unit: "mmol/L" },
  { id: "rec_034", date: "2026-04-18", indicatorType: "ldl", value: 2.8, unit: "mmol/L" },
  { id: "rec_035", date: "2026-04-18", indicatorType: "hdl", value: 1.5, unit: "mmol/L" },
  { id: "rec_036", date: "2026-04-18", indicatorType: "alt", value: 25, unit: "U/L" },
  { id: "rec_037", date: "2026-04-18", indicatorType: "ast", value: 22, unit: "U/L" },
  { id: "rec_038", date: "2026-04-18", indicatorType: "creatinine", value: 75, unit: "µmol/L" },
  { id: "rec_039", date: "2026-04-18", indicatorType: "bun", value: 4.9, unit: "mmol/L" },
  { id: "rec_040", date: "2026-04-18", indicatorType: "weight", value: 70.5, unit: "kg" },
  { id: "rec_041", date: "2026-04-18", indicatorType: "bmi", value: 23.1, unit: "" },
  { id: "rec_042", date: "2026-04-18", indicatorType: "heartRate", value: 68, unit: "次/分" },
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `rec_bp_${i}`, date: `2025-09-${String(i + 1).padStart(2, "0")}`, indicatorType: "bloodPressureHigh", value: 120 + i, unit: "mmHg",
  })),
];

const categories = [
  { id: "bloodPressure", name: "血压", items: [
    { id: "bloodPressureHigh", label: "收缩压 (高压)", unit: "mmHg" },
    { id: "bloodPressureLow", label: "舒张压 (低压)", unit: "mmHg" }
  ]},
  { id: "bloodSugar", name: "血糖", items: [
    { id: "bloodSugar", label: "血糖", unit: "mmol/L" }
  ]},
  { id: "cholesterolPanel", name: "血脂", items: [
    { id: "cholesterol", label: "总胆固醇", unit: "mmol/L" },
    { id: "triglycerides", label: "甘油三酯", unit: "mmol/L" },
    { id: "ldl", label: "低密度脂蛋白", unit: "mmol/L" },
    { id: "hdl", label: "高密度脂蛋白", unit: "mmol/L" }
  ]},
  { id: "liverFunction", name: "肝功能", items: [
    { id: "alt", label: "谷丙转氨酶", unit: "U/L" },
    { id: "ast", label: "谷草转氨酶", unit: "U/L" }
  ]},
  { id: "renalFunction", name: "肾功能", items: [
    { id: "creatinine", label: "肌酐", unit: "µmol/L" },
    { id: "bun", label: "尿素氮", unit: "mmol/L" }
  ]},
  { id: "weight", name: "体重", items: [
    { id: "weight", label: "体重", unit: "kg" }
  ]},
  { id: "bmi", name: "BMI", items: [
    { id: "bmi", label: "BMI", unit: "" }
  ]},
  { id: "heartRate", name: "心率", items: [
    { id: "heartRate", label: "心率", unit: "次/分" }
  ]}
];

async function openDialogAndClose(page, triggerSelector, shotName, expectedText) {
  await page.click(triggerSelector);
  await page.waitForTimeout(700);
  const found = await page.getByText(expectedText).first().isVisible().catch(() => false);
  check(`弹窗打开: ${expectedText}`, found);
  await page.screenshot({ path: path.join(OUT, shotName) });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}

async function runDesktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  page.on('dialog', d => d.accept());

  await page.addInitScript(({ records, categories }) => {
    localStorage.setItem('health_records_v1', JSON.stringify(records));
    localStorage.setItem('health_indicator_categories_v1', JSON.stringify(categories));
    localStorage.removeItem('health_last_active_user_v1');
  }, { records: testRecords, categories });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);

  // ===== 外壳 =====
  check('侧边栏可见', await page.locator('aside').isVisible());
  const navTexts = await page.locator('aside button').allInnerTexts();
  check('侧边栏含 9 个功能入口', navTexts.filter(t => t.trim()).length >= 9, navTexts.filter(t => t.trim()).join(' / '));
  check('顶栏搜索框可见', await page.getByPlaceholder('搜索记录、指标...').isVisible());
  check('顶栏标题', await page.getByText('数据概览').first().isVisible());
  check('统计卡-总记录数 52', await page.getByText('52', { exact: true }).first().isVisible());
  check('统计卡-最后更新', await page.getByText('2026/4/18').first().isVisible().catch(() => page.getByText('2026-04-18').first().isVisible()));
  await page.screenshot({ path: path.join(OUT, '01-desktop-shell.png') });

  // ===== 数据列表 =====
  check('透视表分页信息', await page.getByText(/共 \d+ 条记录，显示第/).first().isVisible());
  // 翻页：血压分类默认第一页（共 13 条 → 2 页）
  const pageInfoFirst = await page.getByText(/共 \d+ 条记录，显示第/).first().innerText().catch(() => '');
  check('血压分类共 13 条', pageInfoFirst.includes('共 13 条记录，显示第 1-10 条'), pageInfoFirst);
  await page.getByRole('button', { name: '下一页' }).click();
  await page.waitForTimeout(400);
  const pageInfoSecond = await page.getByText(/共 \d+ 条记录，显示第/).first().innerText().catch(() => '');
  check('翻页到第 2 页', pageInfoSecond.includes('显示第 11-13 条'), pageInfoSecond);
  await page.getByRole('button', { name: '上一页' }).click();
  await page.waitForTimeout(300);
  await page.locator('aside').getByText('删除全部').click();
  await page.waitForTimeout(500);
  check('删除全部确认弹窗', await page.getByText('确认删除所有数据？').isVisible());
  await page.screenshot({ path: path.join(OUT, '02-clear-confirm.png') });
  await page.getByRole('button', { name: '取消' }).click();
  await page.waitForTimeout(300);

  // 搜索过滤（按日期 2026 匹配 2 行）
  await page.getByPlaceholder('搜索记录、指标...').fill('2026');
  await page.waitForTimeout(400);
  const pageInfoSearch = await page.getByText(/共 \d+ 条记录，显示第/).first().innerText().catch(() => '');
  check('搜索后分页信息变化', pageInfoSearch.includes('共 2 条'), pageInfoSearch);
  await page.screenshot({ path: path.join(OUT, '03-search-filter.png') });
  await page.getByPlaceholder('搜索记录、指标...').fill('');
  await page.waitForTimeout(300);

  // 分类切换
  await page.locator('aside').getByText('检验指标维护').click();
  await page.waitForTimeout(700);
  const maintDialogVisible = await page.getByText('分类管理').first().isVisible().catch(() => false);
  check('侧边栏: 检验指标维护弹窗', maintDialogVisible);
  await page.screenshot({ path: path.join(OUT, '04-indicator-maintenance.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await openDialogAndClose(page, 'aside >> text=添加检验记录', '05-add-record.png', '添加体检记录');
  await openDialogAndClose(page, 'aside >> text=报告导入', '06-report-import.png', '拖拽文件到此处');
  await openDialogAndClose(page, 'aside >> text=问诊简报', '07-consultation-brief.png', '问诊简报');
  await openDialogAndClose(page, 'aside >> text=Excel 导入', '08-excel-import.png', 'Excel 导入');
  await openDialogAndClose(page, 'aside >> text=导出Excel', '09-excel-export.png', '数据导出');
  await openDialogAndClose(page, 'aside >> text=云同步', '10-cloud-sync.png', '云同步');

  // 立即同步（无云端配置时 alert 已被 auto-accept）
  await page.locator('aside').getByText('立即同步').click();
  await page.waitForTimeout(600);
  check('侧边栏: 立即同步可点击', true);
  await page.screenshot({ path: path.join(OUT, '11-manual-sync.png') });

  // 通知中心
  await page.getByRole('button', { name: '通知' }).click();
  await page.waitForTimeout(500);
  check('通知面板打开', await page.getByText('通知中心').isVisible());
  await page.screenshot({ path: path.join(OUT, '12-notifications.png') });
  await page.getByRole('button', { name: '查看全部变更' }).click();
  await page.waitForTimeout(600);
  check('通知跳转数据维护页', await page.getByText('记录列表').isVisible().catch(() => false));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ===== 图表分析 =====
  await page.getByRole('tab', { name: '图表分析' }).click();
  await page.waitForTimeout(1200);
  // 切到血脂分类（4 指标 → 4 图 + 1 雷达）
  await page.getByLabel('选择检验指标种类').selectOption({ label: '血脂' });
  await page.waitForTimeout(1000);
  const chartCount = await page.locator('.recharts-wrapper').count();
  check('图表卡片渲染 (血脂4指标+雷达=5图)', chartCount >= 5, `recharts 数量: ${chartCount}`);
  check('雷达卡可见', await page.getByText('健康指标雷达').isVisible().catch(() => false));

  // ===== 视图模式切换 =====
  await page.getByRole('button', { name: '多指标对比' }).click();
  await page.waitForTimeout(800);
  const overlayWrappers = await page.locator('.recharts-wrapper').count();
  check('叠加模式单图', overlayWrappers === 1, `wrapper: ${overlayWrappers}`);
  check('归一化提示可见', await page.getByText('纵轴为归一化值').isVisible().catch(() => false));
  const linesBefore = await page.locator('.recharts-line').count();
  check('叠加图 4 条指标线', linesBefore === 4, `lines: ${linesBefore}`);
  // 逐个隐藏到仅剩 1 条线 → Y 轴退回原始值范围
  await page.locator('button', { hasText: '总胆固醇' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: '甘油三酯' }).first().click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: '低密度脂蛋白' }).first().click();
  await page.waitForTimeout(600);
  const linesSingle = await page.locator('.recharts-line').count();
  check('图例隐藏到仅剩 1 条线', linesSingle === 1, `lines: ${linesSingle}`);
  check('单线时 Y 轴为原始值', await page.getByText(/纵轴为原始值（单位：mmol\/L）/).isVisible().catch(() => false));
  const yAxisUnitCount = await page.locator('.recharts-wrapper').getByText('mmol/L', { exact: true }).count();
  check('单线时 Y 轴标注单位', yAxisUnitCount >= 1, `轴上单位文本: ${yAxisUnitCount}`);
  await page.screenshot({ path: path.join(OUT, '19-chart-overlay-single.png') });
  // 恢复全部指标线
  await page.locator('button', { hasText: '总胆固醇' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: '甘油三酯' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: '低密度脂蛋白' }).first().click();
  await page.waitForTimeout(600);
  const linesRestored = await page.locator('.recharts-line').count();
  const normCaptionBack = await page.getByText('纵轴为归一化值').isVisible().catch(() => false);
  check('恢复后回到归一化坐标', linesRestored === 4 && normCaptionBack, `lines:${linesRestored} 归一化提示:${normCaptionBack}`);
  // 刷新后模式持久化
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.getByRole('tab', { name: '图表分析' }).click();
  await page.waitForTimeout(800);
  const overlayAfterReload = await page.locator('.recharts-wrapper').count();
  const bpPressed = await page.getByRole('button', { name: '多指标对比' }).getAttribute('aria-pressed');
  check('刷新后保持叠加模式', overlayAfterReload === 1 && bpPressed === 'true', `wrapper:${overlayAfterReload} pressed:${bpPressed}`);
  check('刷新后分类持久化(血脂)', await page.getByText('总胆固醇').first().isVisible().catch(() => false));
  await page.getByRole('button', { name: '分指标卡片' }).click();
  await page.waitForTimeout(600);
  check('切回卡片模式雷达恢复', await page.getByText('健康指标雷达').isVisible().catch(() => false));
  check('时间范围筛选', await page.getByRole('button', { name: '90天' }).isVisible());
  await page.getByRole('button', { name: '90天' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '13-chart-analysis.png') });
  // 搜索联动
  await page.getByPlaceholder('搜索记录、指标...').fill('体重');
  await page.waitForTimeout(500);
  const chartCountFiltered = await page.locator('.recharts-wrapper').count();
  check('搜索过滤图表卡片', chartCountFiltered < chartCount, `${chartCount} → ${chartCountFiltered}`);
  await page.getByPlaceholder('搜索记录、指标...').fill('');
  await page.waitForTimeout(400);

  // ===== 数据维护 =====
  await page.getByRole('tab', { name: '数据维护' }).click();
  await page.waitForTimeout(800);
  check('启动卡: 管理指标', await page.getByRole('button', { name: '管理指标' }).isVisible());
  check('启动卡: 导入Excel', await page.getByRole('button', { name: '导入Excel', exact: true }).isVisible());
  check('启动卡: 导出Excel', await page.getByRole('button', { name: /导出Excel/ }).nth(1).isVisible());
  check('启动卡: 导入报告', await page.getByRole('button', { name: '导入报告' }).isVisible());
  check('危险区按钮', await page.getByRole('button', { name: '删除全部数据' }).isVisible());
  check('同步状态徽章', await page.getByText('未配置云同步').isVisible());
  check('记录表格保留', await page.getByText('记录列表').isVisible());
  check('变更记录保留', await page.getByText('变更记录').first().isVisible());
  // 维护页搜索联动
  await page.getByPlaceholder('搜索记录、指标...').fill('2025-09');
  await page.waitForTimeout(500);
  const septRowVisible = await page.getByText('2025-09-01').first().isVisible().catch(() => false);
  const aprRowVisible = await page.getByText('2026-04-18').isVisible().catch(() => false);
  check('维护页搜索过滤行', septRowVisible && !aprRowVisible, `9月行可见:${septRowVisible} 4月行可见:${aprRowVisible}`);
  await page.getByPlaceholder('搜索记录、指标...').fill('');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '14-maintenance.png') });

  // 维护页导出 Excel（第二个实例）
  await page.getByRole('button', { name: /导出Excel/ }).nth(1).click();
  await page.waitForTimeout(700);
  check('维护页: 导出弹窗打开', await page.getByText('数据导出').first().isVisible().catch(() => false));
  await page.screenshot({ path: path.join(OUT, '15-maint-export.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await context.close();
}

async function runMobile(browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'zh-CN', isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('dialog', d => d.accept());

  await page.addInitScript(({ records, categories }) => {
    localStorage.setItem('health_records_v1', JSON.stringify(records));
    localStorage.setItem('health_indicator_categories_v1', JSON.stringify(categories));
    localStorage.removeItem('health_last_active_user_v1');
  }, { records: testRecords, categories });

  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);

  const sidebarHidden = await page.locator('aside').isHidden();
  check('移动端: 侧边栏隐藏', sidebarHidden);
  check('移动端: 汉堡按钮可见', await page.getByRole('button', { name: '打开导航菜单' }).isVisible());
  await page.screenshot({ path: path.join(OUT, '16-mobile.png') });

  await page.getByRole('button', { name: '打开导航菜单' }).click();
  await page.waitForTimeout(700);
  const drawerItem = page.locator('[data-slot="sheet-content"], [role="dialog"]').getByText('添加检验记录').first();
  check('移动端: 抽屉打开含导航', await drawerItem.isVisible());
  await page.screenshot({ path: path.join(OUT, '17-mobile-drawer.png') });

  await drawerItem.click();
  await page.waitForTimeout(700);
  check('移动端: 抽屉内触发添加记录弹窗', await page.getByText('添加体检记录').first().isVisible().catch(() => false));
  await page.screenshot({ path: path.join(OUT, '18-mobile-add-record.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.mouse.click(340, 100);
  await page.waitForTimeout(400);

  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    await runDesktop(browser);
    await runMobile(browser);
  } catch (err) {
    console.error('SMOKE crashed:', err);
    results.push({ name: '脚本整体执行', pass: false, detail: String(err) });
  }
  await browser.close();

  const failed = results.filter(r => !r.pass);
  console.log(`\n===== 结果: ${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) {
    failed.forEach(f => console.log(`❌ ${f.name} ${f.detail}`));
    process.exit(1);
  }
})();
