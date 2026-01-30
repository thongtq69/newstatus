const puppeteer = require('puppeteer');

const TARGET_URL = 'https://www.facebook.com/groups/chocudanvinhomeq9/?sorting_setting=CHRONOLOGICAL';

(async () => {
    // Log function for visibility
    const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

    // Generic error handler for the loop
    while (true) {
        let browser = null;
        try {
            log('Launching new browser session (Guest Mode)...');
            // "--guest" forces a Guest window. 
            // Note: In Guest mode, Puppeteer might not support creating NEW pages easily, so we must use the existing one.
            browser = await puppeteer.launch({
                headless: false,
                defaultViewport: null,
                args: ['--start-maximized', '--disable-notifications', '--no-sandbox', '--guest']
            });

            // Permissions might not work in Guest mode, but we try
            const context = browser.defaultBrowserContext();
            try {
                await context.overridePermissions('https://www.facebook.com', []);
            } catch (e) { /* ignore in guest */ }

            // Use the first open page instead of creating a new one to avoid Protocol Error in Guest mode
            const pages = await browser.pages();
            const page = pages.length > 0 ? pages[0] : await browser.newPage();

            // Set realistic User Agent to avoid immediate "Update Browser" or "Login" walls
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // 1st Load
            log('Pasting URL (1st load)...');
            await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await new Promise(r => setTimeout(r, 3000)); // Wait a bit

            // 2nd Load (Refresh/Re-paste as requested)
            log('Pasting URL (2nd load)...');
            await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

            log('Checking for popups...');
            // Wait a bit for any dynamic modals
            await new Promise(r => setTimeout(r, 5000));

            // Generic closing logic for common Facebook popups
            try {
                // Look for standard close buttons
                const closeButton = await page.$('div[role="dialog"] div[aria-label="Đóng"]');
                if (closeButton) {
                    log('Found a close button (aria-label="Đóng"). Clicking...');
                    await closeButton.click();
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    log('No "Close" button found immediately.');
                }
            } catch (err) {
                log('Error handling popup: ' + err.message);
            }

            log('Starting scroll and scrape...');

            // Scroll and scrape logic
            let scrapedUrls = new Set();
            let attempts = 0;
            const MAX_ATTEMPTS = 20;

            while (scrapedUrls.size < 5 && attempts < MAX_ATTEMPTS) {
                const newUrls = await page.evaluate(() => {
                    const results = [];
                    const anchors = Array.from(document.querySelectorAll('a'));
                    const postLinkRegex = /\/groups\/[^\/]+\/posts\/\d+/;
                    const permalinkRegex = /\/permalink\/\d+/;

                    anchors.forEach(a => {
                        const href = a.href;
                        if (postLinkRegex.test(href) || permalinkRegex.test(href)) {
                            const cleanUrl = href.split('?')[0];
                            results.push(cleanUrl);
                        }
                    });
                    return results;
                });

                newUrls.forEach(url => scrapedUrls.add(url));
                log(`Found ${scrapedUrls.size} unique URLs so far...`);

                if (scrapedUrls.size >= 5) break;

                await page.evaluate(() => {
                    window.scrollBy(0, 1000);
                });
                await new Promise(r => setTimeout(r, 2000));
                attempts++;
            }

            const finalUrls = Array.from(scrapedUrls).slice(0, 5);
            console.log('--- 5 LATEST POSTS ---');
            finalUrls.forEach(url => console.log(url));
            console.log('----------------------');

            log('Job done. Closing browser and restarting loop in 5 seconds...');

        } catch (error) {
            console.error('Iteration error:', error.message);
            log('Restarting with fresh browser in 10 seconds...');
            await new Promise(r => setTimeout(r, 5000));
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (closeErr) { }
            }
            await new Promise(r => setTimeout(r, 5000));
        }
    }
})();
