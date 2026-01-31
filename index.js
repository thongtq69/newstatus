const puppeteer = require('puppeteer');

const TARGET_URL = 'https://www.facebook.com/groups/chocudanvinhomeq9/?sorting_setting=CHRONOLOGICAL';

// Try different Facebook versions
const FB_VERSIONS = {
    mobile: 'https://m.facebook.com/groups/chocudanvinhomeq9/?sorting_setting=CHRONOLOGICAL',
    mbasic: 'https://mbasic.facebook.com/groups/chocudanvinhomeq9/?sorting_setting=CHRONOLOGICAL',
    touch: 'https://touch.facebook.com/groups/chocudanvinhomeq9/?sorting_setting=CHRONOLOGICAL'
};

// Mobile device configuration (iPhone 14 Pro Max)
const MOBILE_CONFIG = {
    viewport: {
        width: 430,
        height: 932,
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        isLandscape: false
    },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
};

(async () => {
    // Log function for visibility
    const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

    // Run once (set to while(true) for continuous mode)
    for (let iteration = 0; iteration < 1; iteration++) {
        let browser = null;
        try {
            log('Launching browser in MOBILE mode (iPhone 14 Pro Max)...');

            browser = await puppeteer.launch({
                headless: false,
                defaultViewport: MOBILE_CONFIG.viewport,
                args: [
                    '--disable-notifications',
                    '--no-sandbox',
                    '--guest',
                    `--window-size=${MOBILE_CONFIG.viewport.width},${MOBILE_CONFIG.viewport.height + 100}`
                ]
            });

            // Permissions might not work in Guest mode, but we try
            const context = browser.defaultBrowserContext();
            try {
                await context.overridePermissions('https://www.facebook.com', []);
            } catch (e) { /* ignore in guest */ }

            // Use the first open page instead of creating a new one to avoid Protocol Error in Guest mode
            const pages = await browser.pages();
            const page = pages.length > 0 ? pages[0] : await browser.newPage();

            // Set mobile viewport and User Agent
            await page.setViewport(MOBILE_CONFIG.viewport);
            await page.setUserAgent(MOBILE_CONFIG.userAgent);

            log('Mobile mode configured: iPhone 14 Pro Max (430x932)');

            // Step 1: Go to Google first (mobile mode)
            log('Step 1: Opening Google in mobile mode...');
            await page.goto('https://www.google.com', { waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(r => setTimeout(r, 2000));
            log('Google loaded in mobile mode successfully!');

            // Take a screenshot to verify mobile mode
            await page.screenshot({ path: 'google_mobile.png' });
            log('Screenshot saved: google_mobile.png');

            // Step 2: Go to m.facebook.com (shows some posts without login)
            log('Step 2: Opening m.facebook.com (mobile version)...');
            log(`Mobile URL: ${FB_VERSIONS.mobile}`);

            await page.goto(FB_VERSIONS.mobile, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await new Promise(r => setTimeout(r, 4000));

            await page.screenshot({ path: 'facebook_mobile_initial.png' });
            log('Screenshot saved: facebook_mobile_initial.png');

            // Check current URL
            let currentUrl = page.url();
            log(`Current URL: ${currentUrl}`);

            // If redirected to login, try touch.facebook.com
            if (currentUrl.includes('login') || currentUrl.includes('checkpoint')) {
                log('Redirected to login. Trying touch.facebook.com...');
                await page.goto(FB_VERSIONS.touch, { waitUntil: 'networkidle2', timeout: 60000 });
                await new Promise(r => setTimeout(r, 4000));
                await page.screenshot({ path: 'facebook_touch.png' });
                currentUrl = page.url();
            }

            // Reload page once to ensure content loads
            log('Reloading page to ensure content loads...');
            await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
            await new Promise(r => setTimeout(r, 3000));

            log('Checking for popups...');
            await new Promise(r => setTimeout(r, 3000));

            // Generic closing logic for common Facebook popups
            try {
                // Try multiple close button selectors
                const closeSelectors = [
                    'div[role="dialog"] div[aria-label="Đóng"]',
                    'div[role="dialog"] [aria-label="Close"]',
                    '[data-sigil="dialog-cancel"]',
                    'button[data-sigil="touchable"]'
                ];

                for (const selector of closeSelectors) {
                    const closeButton = await page.$(selector);
                    if (closeButton) {
                        log(`Found close button: ${selector}. Clicking...`);
                        await closeButton.click();
                        await new Promise(r => setTimeout(r, 2000));
                        break;
                    }
                }
            } catch (err) {
                log('Error handling popup: ' + err.message);
            }

            log('Starting scrape (mobile mode)...');

            // Take screenshot
            await page.screenshot({ path: 'facebook_scrape_start.png' });
            log('Screenshot saved: facebook_scrape_start.png');

            // Method 1: Extract visible post content directly from page
            log('Method 1: Extracting visible post content from touch/m.facebook...');

            const visiblePosts = await page.evaluate(() => {
                const results = [];
                const bodyText = document.body.innerText;

                // For touch.facebook.com and m.facebook.com
                // Look for posts by finding author name patterns
                // Posts usually have: [Avatar] [Author Name] [Time] [Content]

                // Method A: Find all elements with author-like structure
                const allElements = document.querySelectorAll('*');
                const seenAuthors = new Set();

                allElements.forEach((el, idx) => {
                    const text = el.innerText?.trim() || '';

                    // Check if this looks like a post header (has time indicator)
                    const hasTimeIndicator = /\d+\s*(phút|giờ|giây|ngày|h|m|s|minutes?|hours?|days?)/.test(text);

                    // Look for posts with author pattern
                    if (hasTimeIndicator && text.length > 20 && text.length < 2000) {
                        // Try to extract author - usually first line or first bold text
                        const lines = text.split('\n').filter(l => l.trim());
                        if (lines.length >= 2) {
                            const potentialAuthor = lines[0].trim();

                            // Skip if it's just Facebook header or generic text
                            if (potentialAuthor.length > 2 &&
                                potentialAuthor.length < 50 &&
                                !potentialAuthor.includes('facebook') &&
                                !potentialAuthor.includes('Đăng nhập') &&
                                !potentialAuthor.includes('Tham gia') &&
                                !seenAuthors.has(potentialAuthor)) {

                                seenAuthors.add(potentialAuthor);

                                // Extract time
                                const timeMatch = text.match(/(\d+\s*(phút|giờ|giây|ngày|h|m|s|minutes?|hours?|days?)\s*(trước)?)/i);
                                const time = timeMatch ? timeMatch[0] : '';

                                // Get content (everything after first 2 lines)
                                const content = lines.slice(1).join(' ').substring(0, 300);

                                results.push({
                                    author: potentialAuthor,
                                    time: time,
                                    content: content,
                                    elementTag: el.tagName,
                                    textLength: text.length
                                });
                            }
                        }
                    }
                });

                // Method B: Look for specific Facebook mobile post structure
                // Find elements that look like post containers
                const postLikeElements = document.querySelectorAll([
                    '[role="article"]',
                    '[data-tracking]',
                    'div > span + span',  // Author + time pattern
                    'article'
                ].join(', '));

                postLikeElements.forEach((el, idx) => {
                    const text = el.innerText?.trim() || '';
                    if (text.length > 50 && text.length < 5000) {
                        // Find all links in this post
                        const links = Array.from(el.querySelectorAll('a[href]'));
                        const postLink = links.find(a =>
                            a.href.includes('permalink') ||
                            a.href.includes('/posts/') ||
                            a.href.includes('story')
                        )?.href || '';

                        const authorLink = links.find(a => a.href.includes('/profile.php') || a.href.includes('/user/'));
                        const author = authorLink?.innerText?.trim() || '';

                        if (author && !results.some(r => r.author === author)) {
                            results.push({
                                author: author,
                                content: text.substring(0, 300),
                                postLink: postLink,
                                method: 'B'
                            });
                        }
                    }
                });

                // Method C: Simple text extraction - find Vietnamese names followed by time
                const nameTimeRegex = /([A-ZÀ-Ỹ][a-zà-ỹ]+\s+[A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+)?)\s*[\n\r]+\s*(\d+\s*(?:phút|giờ|giây|ngày))/g;
                let match;
                while ((match = nameTimeRegex.exec(bodyText)) !== null) {
                    const author = match[1];
                    const time = match[2];
                    if (!results.some(r => r.author === author)) {
                        results.push({
                            author: author,
                            time: time,
                            method: 'C'
                        });
                    }
                }

                return results;
            });

            log(`Found ${visiblePosts.length} posts with Method 1`);

            // Filter and dedupe - remove Facebook headers and UI elements
            const filterWords = [
                'Mở ứng dụng', 'Đăng nhập', 'Tham gia', 'facebook',
                'CHỢ CƯ DÂN', 'VINHOME', 'GRAND PARK', 'Nhóm Công khai',
                'thành viên', 'Giới thiệu', 'NỘI DUNG', 'DUYỆT',
                'Tạo tài khoản', 'Còn nhiều nội dung'
            ];

            const uniquePosts = [];
            const seenAuthors = new Set();

            visiblePosts.forEach(p => {
                if (!p.author) return;

                // Skip if author looks like Facebook UI element
                const isUI = filterWords.some(word =>
                    p.author.toUpperCase().includes(word.toUpperCase())
                );
                if (isUI) return;

                // Skip if content is mostly group info
                const contentIsUI = p.content && filterWords.some(word =>
                    p.content.substring(0, 100).toUpperCase().includes(word.toUpperCase())
                );
                if (contentIsUI && !p.time) return;

                // Skip very short or very long author names
                if (p.author.length < 2 || p.author.length > 40) return;

                if (!seenAuthors.has(p.author)) {
                    seenAuthors.add(p.author);
                    uniquePosts.push(p);
                }
            });

            console.log('\n');
            console.log('╔══════════════════════════════════════════════════════════════╗');
            console.log('║           BÀI VIẾT TÌM ĐƯỢC TỪ GROUP (MOBILE MODE)           ║');
            console.log('╚══════════════════════════════════════════════════════════════╝');

            if (uniquePosts.length === 0) {
                console.log('\nKhông tìm được bài viết. Facebook yêu cầu đăng nhập.');
            } else {
                uniquePosts.slice(0, 10).forEach((p, i) => {
                    console.log(`\n┌─── Bài viết ${i + 1} ───────────────────────────────────────────┐`);
                    console.log(`│ Tác giả: ${p.author}`);
                    console.log(`│ Thời gian: ${p.time || 'N/A'}`);
                    if (p.content) {
                        const cleanContent = p.content.replace(/\s+/g, ' ').substring(0, 150);
                        console.log(`│ Nội dung: ${cleanContent}...`);
                    }
                    if (p.postLink) console.log(`│ Link: ${p.postLink}`);
                    console.log('└────────────────────────────────────────────────────────────────┘');
                });
            }
            console.log(`\nTổng số bài viết tìm được: ${uniquePosts.length}`);

            // Method 2: Try getting all links with post patterns
            log('\nMethod 2: Searching for post URLs...');

            let scrapedPosts = new Set();
            let attempts = 0;
            const MAX_ATTEMPTS = 10;

            while (scrapedPosts.size < 5 && attempts < MAX_ATTEMPTS) {
                const newPosts = await page.evaluate(() => {
                    const results = [];
                    const anchors = Array.from(document.querySelectorAll('a'));

                    // Extended patterns for all Facebook versions
                    const patterns = [
                        /\/groups\/[^\/]+\/posts\/\d+/,
                        /\/groups\/[^\/]+\/permalink\/\d+/,
                        /\/story\.php\?story_fbid=\d+/,
                        /\/groups\/\d+\?view=permalink/,
                        /\?id=\d+&story_fbid=\d+/,
                        /\/comment\/replies/,
                        /multi_permalinks/
                    ];

                    anchors.forEach(a => {
                        const href = a.href || '';
                        for (const pattern of patterns) {
                            if (pattern.test(href)) {
                                results.push({
                                    url: href.split('&refid=')[0],
                                    text: a.innerText?.substring(0, 80) || ''
                                });
                                break;
                            }
                        }
                    });

                    return results;
                });

                newPosts.forEach(post => scrapedPosts.add(JSON.stringify(post)));
                log(`Found ${scrapedPosts.size} unique post URLs... (attempt ${attempts + 1}/${MAX_ATTEMPTS})`);

                if (scrapedPosts.size >= 5) break;

                // Scroll down
                await page.evaluate(() => window.scrollBy(0, 400));
                await new Promise(r => setTimeout(r, 2000));
                attempts++;

                // Check for login wall
                const hasLoginWall = await page.evaluate(() => {
                    return document.body.innerText.includes('Đăng nhập') &&
                        document.body.innerText.includes('Còn nhiều nội dung');
                });

                if (hasLoginWall) {
                    log('Login wall detected! Cannot scroll further without login.');
                    await page.screenshot({ path: 'facebook_login_wall.png' });
                    break;
                }
            }

            // Final output
            const finalPosts = Array.from(scrapedPosts).slice(0, 5).map(p => JSON.parse(p));
            console.log('\n========== POST URLs FOUND ==========');
            if (finalPosts.length > 0) {
                finalPosts.forEach((post, idx) => {
                    console.log(`${idx + 1}. ${post.url}`);
                    if (post.text) console.log(`   Preview: ${post.text}`);
                });
            } else {
                console.log('No post URLs found. Posts visible but no direct links available without login.');
                console.log('Check screenshots for visible content.');
            }
            console.log('=====================================\n');

            // Save page HTML for debugging
            const fs = require('fs');
            const html = await page.content();
            fs.writeFileSync('facebook_page.html', html);
            log('Page HTML saved to facebook_page.html for debugging');

            log('Job done!');

            // Keep browser open for 10 seconds so user can see
            log('Browser will close in 10 seconds...');
            await new Promise(r => setTimeout(r, 10000));

        } catch (error) {
            console.error('Error:', error.message);
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (closeErr) { }
            }
        }
    }

    // Exit after one iteration (remove this line to run continuously)
    process.exit(0);
})();
