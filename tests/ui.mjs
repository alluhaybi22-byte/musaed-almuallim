export async function prepareAction(page, name) {
  if (name === 'استكمال') await page.locator('.secondary-details').evaluateAll(xs => xs.forEach(el => el.open = true));
  if (['add-student','إضافة طالب'].includes(name) && !(await page.locator('[data-action="add-student"]:visible').count()))
    await page.locator('.nav [data-route="students"]').click();
  if (await page.locator('.setup-custom').count()) {
    if (['clear-selection','select-visible','preset-comprehension','preset-writing','preset-lesson','إلغاء الكل','تحديد الظاهر','الفهم والاستماع','الكتابة والإملاء','مستويات قراءة الدرس'].includes(name))
      await page.locator('.setup-custom').evaluate(el => el.open = true);
  }
}
export async function action(page, name) {
  await prepareAction(page, name);
  const control = page.locator('[data-action="' + name + '"]');
  if (name === 'resume') {
    const visible = page.locator('[data-action="resume"]:visible');
    if (await visible.count()) return visible.first().click();
    await page.locator('.secondary-details').evaluateAll(xs => xs.forEach(el => el.open = true));
  }
  return control.first().click();
}
