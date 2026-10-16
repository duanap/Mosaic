/** Open the actual native setup dialog before using its form. */
export async function openSetup(page,mode) {
  if(await page.locator(`#setup-form[data-mode="${mode}"]`).isVisible()) return;
  await page.locator(`#open-${mode}`).click();
  await page.locator(`#setup-form[data-mode="${mode}"]`).waitFor();
}
export async function startLocal(page) {await openSetup(page,'local');await page.locator('#local-start').click();}
