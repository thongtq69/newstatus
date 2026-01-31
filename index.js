const puppeteer = require('puppeteer');
const fs = require('fs');

// Đọc URL từ file config
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const GROUP_URL = config.GROUP_URL.includes('?') ? config.GROUP_URL : `${config.GROUP_URL}?sorting_setting=CHRONOLOGICAL`;

(async () => {
    const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
    
    let browser = null;
    
    try {
        log('Launching browser...');
        
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: { width: 1366, height: 900 },
            args: ['--disable-notifications', '--no-sandbox']
        });

        const pages = await browser.pages();
        const page = pages.length > 0 ? pages[0] : await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Login
        log('Opening Facebook...');
        await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2', timeout: 60000 });
        
        log('');
        log('══════════════════════════════════════════════════════════');
        log('   VUI LÒNG ĐĂNG NHẬP VÀO FACEBOOK');
        log('══════════════════════════════════════════════════════════');
        log('');
        
        let loginSuccess = false;
        let waitTime = 0;
        
        while (!loginSuccess && waitTime < 180) {
            await new Promise(r => setTimeout(r, 3000));
            waitTime += 3;
            try {
                const url = page.url();
                if (url.includes('facebook.com') && !url.includes('/login') && !url.includes('checkpoint')) {
                    const ok = await page.evaluate(() => {
                        return !!(document.querySelector('[role="feed"]') || document.querySelector('[aria-label="Trang chủ"]'));
                    });
                    if (ok) { loginSuccess = true; log('✓ Đăng nhập thành công!'); }
                }
                if (!loginSuccess) process.stdout.write(`\rĐang chờ... (${waitTime}s)   `);
            } catch (e) {}
        }
        if (!loginSuccess) { log('Timeout.'); return; }

        // Go to group
        log('');
        log('Đang vào group...');
        await page.goto(GROUP_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        
        log('Chờ trang load (8 giây)...');
        await new Promise(r => setTimeout(r, 8000));
        
        // Close popup
        try {
            const closeBtn = await page.$('div[aria-label="Đóng"]');
            if (closeBtn) { await closeBtn.click(); await new Promise(r => setTimeout(r, 1000)); }
        } catch (e) {}
        
        log('Đã vào group.');

        log('');
        log('══════════════════════════════════════════════════════════');
        log('   CLICK VÀO NÚT CHIA SẺ → SAO CHÉP LIÊN KẾT');
        log('══════════════════════════════════════════════════════════');
        log('');

        const postUrls = new Set();
        const processedContent = new Set(); // Lưu nội dung bài đã xử lý
        let attempts = 0;
        
        // Scroll và click vào các nút "Chia sẻ"
        while (postUrls.size < 5 && attempts < 20) {
            attempts++;
            log(`Lần thử ${attempts} - Đã có ${postUrls.size} URLs`);
            
            // Tìm tất cả nút "Chia sẻ" trên trang
            const shareButtons = await page.evaluate(() => {
                const buttons = [];
                // Tìm các nút có text "Chia sẻ"
                const allElements = document.querySelectorAll('span, div[role="button"]');
                
                allElements.forEach(el => {
                    const text = el.textContent.trim();
                    if (text === 'Chia sẻ' || text === 'Share') {
                        // Tìm element cha clickable
                        let clickable = el.closest('div[role="button"]');
                        if (clickable) {
                            buttons.push({
                                text: text,
                                hasButton: true
                            });
                        }
                    }
                });
                
                return buttons.length;
            });
            
            if (shareButtons === 0) {
                log('Không tìm thấy nút Chia sẻ, scroll xuống...');
                await page.evaluate(() => window.scrollBy(0, 400));
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
            
            log(`Tìm thấy ${shareButtons} nút Chia sẻ`);
            
            // Click vào nút "Chia sẻ" đầu tiên chưa xử lý
            try {
                const clicked = await page.evaluate(() => {
                    const allElements = document.querySelectorAll('span, div[role="button"]');
                    
                    for (let el of allElements) {
                        const text = el.textContent.trim();
                        if ((text === 'Chia sẻ' || text === 'Share') && 
                            !el.hasAttribute('data-processed-share')) {
                            
                            const clickable = el.closest('div[role="button"]');
                            if (clickable) {
                                // Đánh dấu đã xử lý
                                el.setAttribute('data-processed-share', 'true');
                                clickable.click();
                                return true;
                            }
                        }
                    }
                    return false;
                });
                
                if (!clicked) {
                    log('Không thể click, scroll tiếp...');
                    await page.evaluate(() => window.scrollBy(0, 400));
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                
                // Đợi popup "Chia sẻ" mở
                await new Promise(r => setTimeout(r, 2000));
                log('  → Popup Chia sẻ đã mở, tìm nút Sao chép liên kết...');
                
                // LƯU HTML của popup để debug (chỉ lần đầu)
                if (attempts === 1) {
                    const popupHtml = await page.evaluate(() => {
                        const dialog = document.querySelector('div[role="dialog"]');
                        return dialog ? dialog.innerHTML : '';
                    });
                    const fs = require('fs');
                    fs.writeFileSync('popup_debug.html', popupHtml);
                    log('  → Đã lưu popup HTML vào popup_debug.html');
                }
                
                // PHƯƠNG PHÁP MỚI: Tìm nút "Sao chép liên kết" trong popup "Chia sẻ"
                const postUrl = await page.evaluate(() => {
                    const dialog = document.querySelector('div[role="dialog"]');
                    if (!dialog) return null;
                    
                    // Tìm nút "Sao chép liên kết" hoặc "Copy Link"
                    const allElements = dialog.querySelectorAll('span, div[role="button"], a');
                    for (let el of allElements) {
                        const text = el.textContent.trim();
                        if (text === 'Sao chép liên kết' || text === 'Copy Link' || 
                            text.includes('Sao chép') || text.includes('Copy link')) {
                            
                            // Tìm element cha có thể chứa URL
                            const clickable = el.closest('div[role="button"], a');
                            if (clickable) {
                                // Thử lấy href trực tiếp
                                const href = clickable.href || clickable.getAttribute('href');
                                if (href && href.includes('facebook.com')) {
                                    return href.split('?')[0].split('#')[0];
                                }
                                
                                // Thử lấy từ data attribute
                                const dataHref = clickable.getAttribute('data-href') || 
                                                clickable.getAttribute('data-url');
                                if (dataHref && dataHref.includes('facebook.com')) {
                                    return dataHref.split('?')[0].split('#')[0];
                                }
                                
                                // Thử tìm trong parent elements
                                let parent = clickable.parentElement;
                                for (let i = 0; i < 5 && parent; i++) {
                                    const parentHref = parent.href || parent.getAttribute('href');
                                    if (parentHref && parentHref.includes('facebook.com/groups')) {
                                        return parentHref.split('?')[0].split('#')[0];
                                    }
                                    parent = parent.parentElement;
                                }
                            }
                        }
                    }
                    
                    // Backup: Tìm tất cả links trong popup có chứa /groups/ và /permalink/ hoặc /posts/
                    const allLinks = dialog.querySelectorAll('a[href*="/groups/"]');
                    for (let link of allLinks) {
                        const href = link.href;
                        if (href && (href.includes('/permalink/') || href.includes('/posts/'))) {
                            return href.split('?')[0].split('#')[0];
                        }
                    }
                    
                    return null;
                });
                
                // Nếu không tìm thấy URL trực tiếp, thử click vào nút "Sao chép liên kết" và đọc từ clipboard
                if (!postUrl) {
                    log('  → Không tìm thấy URL trực tiếp, thử click vào nút Sao chép liên kết...');
                    
                    // Click vào nút "Sao chép liên kết"
                    const copied = await page.evaluate(() => {
                        const dialog = document.querySelector('div[role="dialog"]');
                        if (!dialog) return false;
                        
                        const allElements = dialog.querySelectorAll('span, div[role="button"], a');
                        for (let el of allElements) {
                            const text = el.textContent.trim();
                            if (text === 'Sao chép liên kết' || text === 'Copy Link' || 
                                text.includes('Sao chép') || text.includes('Copy link')) {
                                const clickable = el.closest('div[role="button"], a');
                                if (clickable) {
                                    clickable.click();
                                    return true;
                                }
                            }
                        }
                        return false;
                    });
                    
                    if (copied) {
                        await new Promise(r => setTimeout(r, 1500));
                        
                        // Đọc từ clipboard
                        const clipboardText = await page.evaluate(async () => {
                            try {
                                return await navigator.clipboard.readText();
                            } catch (e) {
                                return null;
                            }
                        });
                        
                        if (clipboardText && clipboardText.includes('facebook.com/groups')) {
                            const cleanUrl = clipboardText.split('?')[0].split('#')[0];
                            log(`  ✓ Lấy được URL từ clipboard: ${cleanUrl}`);
                            
                            if (!postUrls.has(cleanUrl)) {
                                postUrls.add(cleanUrl);
                                log(`  ✓✓ Đã thêm URL ${postUrls.size}`);
                            }
                            
                            // Đóng popup
                            await page.evaluate(() => {
                                const closeBtn = document.querySelector('div[aria-label="Đóng"], div[aria-label="Close"]');
                                if (closeBtn) closeBtn.click();
                            });
                            await new Promise(r => setTimeout(r, 1000));
                            continue;
                        } else {
                            log('  × Clipboard không chứa URL hợp lệ');
                        }
                    } else {
                        log('  × Không tìm thấy nút Sao chép liên kết');
                    }
                    
                    log('  × Không tìm thấy post URL, đang debug...');
                    
                    // Lưu HTML của popup này để phân tích
                    const debugHtml = await page.evaluate(() => {
                        const dialog = document.querySelector('div[role="dialog"]');
                        return dialog ? dialog.innerHTML : '';
                    });
                    
                    const timestamp = Date.now();
                    const filename = `popup_no_url_${timestamp}.html`;
                    fs.writeFileSync(filename, debugHtml);
                    log(`  → Đã lưu popup HTML vào ${filename} để phân tích`);
                    
                    // Đóng popup và tiếp tục
                    await page.evaluate(() => {
                        const closeBtn = document.querySelector('div[aria-label="Đóng"], div[aria-label="Close"]');
                        if (closeBtn) closeBtn.click();
                    });
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                
                log(`  ✓ Lấy được URL từ popup: ${postUrl}`);
                
                if (!postUrls.has(postUrl)) {
                    postUrls.add(postUrl);
                    log(`  ✓✓ Đã thêm URL ${postUrls.size}`);
                }
                
                // Đóng popup "Chia sẻ"
                await page.evaluate(() => {
                    const closeBtn = document.querySelector('div[aria-label="Đóng"], div[aria-label="Close"], div[role="button"][aria-label*="Đóng"], div[role="button"][aria-label*="Close"]');
                    if (closeBtn) closeBtn.click();
                });
                
                await new Promise(r => setTimeout(r, 1000));
                
            } catch (e) {
                log(`Lỗi khi click: ${e.message}`);
            }
            
            // Nếu chưa đủ, scroll xuống một chút để load thêm bài
            if (postUrls.size < 5 && attempts % 2 === 0) {
                log('  ↓ Scroll xuống để load thêm bài...');
                await page.evaluate(() => window.scrollBy(0, 1000));
                await new Promise(r => setTimeout(r, 2500));
            }
        }

        // Output
        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║              5 URL BÀI VIẾT ĐẦU TIÊN                         ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        
        const finalUrls = Array.from(postUrls).slice(0, 5);
        
        if (finalUrls.length > 0) {
            finalUrls.forEach((url, idx) => {
                console.log(`\n${idx + 1}. ${url}`);
            });
            console.log(`\n\nTổng: ${finalUrls.length} URLs`);
        } else {
            console.log('\nKhông lấy được URL.');
            console.log('Facebook có thể yêu cầu đăng nhập hoặc chặn scraping.');
        }
        console.log('════════════════════════════════════════════════════════════════\n');

        await page.screenshot({ path: 'final_result.png' });
        log('Screenshot: final_result.png');
        log('Browser đóng sau 10 giây...');
        await new Promise(r => setTimeout(r, 10000));

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        if (browser) await browser.close();
    }
})();
