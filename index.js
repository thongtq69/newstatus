const puppeteer = require('puppeteer');

const GROUP_URL = 'https://www.facebook.com/groups/chocudanvinhomeq9/?sorting_setting=CHRONOLOGICAL';

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
            log('   CLICK VÀO NÚT BÌNH LUẬN ĐỂ LẤY URL');
            log('══════════════════════════════════════════════════════════');
            log('');

            const postUrls = new Set();
            const processedContent = new Set(); // Lưu nội dung bài đã xử lý
            let attempts = 0;
            
            // Scroll và click vào các nút bình luận
            while (postUrls.size < 5 && attempts < 20) {
                attempts++;
                log(`Lần thử ${attempts} - Đã có ${postUrls.size} URLs`);
                
                // Tìm tất cả nút "Bình luận" trên trang
                const commentButtons = await page.evaluate(() => {
                    const buttons = [];
                    // Tìm các nút có text "Bình luận" (có thể là span hoặc div)
                    const allElements = document.querySelectorAll('span, div[role="button"]');
                    
                    allElements.forEach(el => {
                        const text = el.textContent.trim();
                        if (text === 'Bình luận' || text.includes('bình luận')) {
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
                
                if (commentButtons === 0) {
                    log('Không tìm thấy nút bình luận, scroll xuống...');
                    await page.evaluate(() => window.scrollBy(0, 400));
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                
                log(`Tìm thấy ${commentButtons} nút bình luận`);
                
                // Click vào nút bình luận đầu tiên chưa xử lý
                try {
                    const clicked = await page.evaluate(() => {
                        const allElements = document.querySelectorAll('span, div[role="button"]');
                        
                        for (let el of allElements) {
                            const text = el.textContent.trim();
                            if ((text === 'Bình luận' || text.includes('bình luận')) && 
                                !el.hasAttribute('data-processed')) {
                                
                                const clickable = el.closest('div[role="button"]');
                                if (clickable) {
                                    // Đánh dấu đã xử lý
                                    el.setAttribute('data-processed', 'true');
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
                    
                    // Đợi popup mở
                    await new Promise(r => setTimeout(r, 2000));
                    log('  → Popup đã mở, tìm timestamp để click...');
                    
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
                    
                    // Lấy nội dung bài viết từ popup để debug
                    const postContent = await page.evaluate(() => {
                        // Tìm popup
                        const dialog = document.querySelector('div[role="dialog"]');
                        if (!dialog) return null;
                        
                        // Lấy title
                        const title = dialog.querySelector('h2, span[dir="auto"]');
                        
                        // Lấy author và time
                        const timeElements = dialog.querySelectorAll('span');
                        let author = '';
                        let timeText = '';
                        
                        timeElements.forEach(span => {
                            const text = span.textContent.trim();
                            if (text.includes('phút') || text.includes('giờ') || text.includes('ngày')) {
                                timeText = text;
                            }
                        });
                        
                        // Lấy nội dung chính
                        const contentDivs = dialog.querySelectorAll('div[dir="auto"]');
                        let content = '';
                        contentDivs.forEach(div => {
                            const text = div.textContent.trim();
                            if (text.length > 10) {
                                content = text;
                            }
                        });
                        
                        return {
                            title: title?.textContent.trim() || '',
                            timeText: timeText,
                            content: content
                        };
                    });
                    
                    if (postContent) {
                        const contentKey = postContent.content.substring(0, 50);
                        
                        // Kiểm tra xem đã xử lý bài này chưa
                        if (processedContent.has(contentKey)) {
                            log(`  × Bài này đã xử lý rồi, scroll xuống...`);
                            await page.evaluate(() => {
                                const closeBtn = document.querySelector('div[aria-label="Đóng"]');
                                if (closeBtn) closeBtn.click();
                            });
                            await new Promise(r => setTimeout(r, 500));
                            await page.evaluate(() => window.scrollBy(0, 800));
                            await new Promise(r => setTimeout(r, 2000));
                            continue;
                        }
                        
                        processedContent.add(contentKey);
                        log(`  → Bài: "${contentKey}..."`);
                        log(`  → Time: "${postContent.timeText}"`);
                    }
                    
                    // Click vào timestamp trong popup
                    // THAY ĐỔI CHIẾN LƯỢC: Lấy post ID từ ảnh hoặc từ DOM
                    const postUrl = await page.evaluate(() => {
                        const dialog = document.querySelector('div[role="dialog"]');
                        if (!dialog) return null;
                        
                        // Tìm post ID từ photo link (pcb.XXXXX)
                        const photoLinks = dialog.querySelectorAll('a[href*="/photo/"]');
                        for (let link of photoLinks) {
                            const href = link.href;
                            const match = href.match(/pcb\.(\d+)/);
                            if (match) {
                                return `https://www.facebook.com/groups/chocudanvinhomeq9/permalink/${match[1]}/`;
                            }
                        }
                        
                        // Backup: Tìm trong data attributes
                        const allElements = dialog.querySelectorAll('[data-id], [id]');
                        for (let el of allElements) {
                            const dataId = el.getAttribute('data-id') || el.id;
                            if (dataId && dataId.match(/^\d{10,}$/)) {
                                return `https://www.facebook.com/groups/chocudanvinhomeq9/permalink/${dataId}/`;
                            }
                        }
                        
                        return null;
                    });
                    
                    if (!postUrl) {
                        log('  × Không tìm thấy post URL, đóng popup...');
                        await page.evaluate(() => {
                            const closeBtn = document.querySelector('div[aria-label="Đóng"]');
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
                    
                    // Đóng popup
                    await page.evaluate(() => {
                        const closeBtn = document.querySelector('div[aria-label="Đóng"]');
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
