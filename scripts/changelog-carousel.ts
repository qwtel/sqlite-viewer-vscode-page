/// <reference types="bun-types" />

import URL from 'url';
import path from 'path';
import { marked } from 'marked';

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolve = (...args: string[]) => path.resolve(__dirname, '..', ...args);

interface Release {
  version: string;
  content: string;
}

async function parseChangelog(): Promise<Release[]|null> {
  const changelogPath = resolve('..', 'CHANGELOG.md');
  if (!await Bun.file(changelogPath).exists()) return null;

  const changelogContent = await Bun.file(changelogPath).text();
  
  const releases: Release[] = [];
  const lines = changelogContent.split('\n');
  
  let currentRelease: string | null = null;
  let currentContent: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match version headers like "## v25.6.1 (Pre-Release)" or "## v0.10"
    const versionMatch = line.match(/^## (v\d+\.\d+(?:\.\d+)?(?:\s*\([^)]+\))?)\s*$/);
    
    if (versionMatch) {
      // Save previous release if exists
      if (currentRelease) {
        releases.push({
          version: currentRelease,
          content: currentContent.join('\n').trim()
        });
      }
      
      // Start new release
      currentRelease = versionMatch[1];
      currentContent = [];
      
      // Get release date from next line if it exists
      if (i + 1 < lines.length && lines[i + 1].includes('Released on')) {
        const dateMatch = lines[i + 1].match(/_Released on (.+?)_/);
        if (dateMatch) {
          currentRelease += ` - ${dateMatch[1]}`;
        }
        i++; // Skip the date line
      }
    } else if (currentRelease) {
      // Add content lines (include empty lines to preserve paragraph breaks)
      currentContent.push(line);
    }
  }
  
  // Add the last release
  if (currentRelease) {
    releases.push({
      version: currentRelease,
      content: currentContent.join('\n').trim()
    });
  }
  
  // Return the 5 most recent releases
  return releases.slice(0, 5);
}

async function generateCarouselHTML(): Promise<string|null> {
  const releases = await parseChangelog();
  if (!releases) return null;
  
  let carouselItems = '';
  
  for (const release of releases) {
    // Clean up the content - preserve paragraph breaks
    const cleanContent = release.content.trim();
    
    // Add 2 levels to each headline (## -> ####, ### -> #####, etc.)
    const contentWithAdjustedHeadlines = cleanContent.replace(/^(#{1,6})\s/gm, (match, hashes) => {
      return '#'.repeat(Math.min(hashes.length + 2, 6)) + ' ';
    });
    
    // Parse markdown content
    let parsedContent = await marked.parse(contentWithAdjustedHeadlines, { 
      gfm: true,
      breaks: false
    });
    
    // Replace [PRO] with sl-badge elements
    parsedContent = parsedContent.replace(/\[PRO\]/g, html`<sl-badge variant="primary" size="small">PRO</sl-badge>`);
    
    // Replace (Pre-Release) with Preview badge in version
    let versionWithBadge = release.version.replace(/\(Pre-Release\)/g, html`<sl-badge variant="neutral" size="small">Preview</sl-badge>`);
    
    // Split version and date, then wrap in spans
    const parts = versionWithBadge.split(' - ');
    if (parts.length === 2) {
      // Parse the date and format it for datetime attribute
      const dateStr = parts[1];
      const date = new Date(dateStr);
      const isoDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      versionWithBadge = html`<span class="version-number">${parts[0]}</span> <time class="version-date" datetime="${isoDate}">${parts[1]}</time>`;
    } else {
      versionWithBadge = html`<span class="version-number">${versionWithBadge}</span>`;
    }
    
    carouselItems += html`
      <sl-carousel-item>
        <div class="changelog-card">
          <div class="changelog-header">
            <h4 class="changelog-version">${versionWithBadge}</h4>
          </div>
          <div class="changelog-content text-sm">
            ${parsedContent}
          </div>
        </div>
      </sl-carousel-item>
    `;
  }

  const fixedItem = html`
    <sl-carousel-item>
      <div class="changelog-card">
        <div class="changelog-header">
          <h4 class="changelog-version"><span class="version-number">Full Version History</span></h4>
        </div>
        <div class="changelog-content text-sm">
          <p>Browse the complete changelog to see all features, bug fixes, and improvements across every version of SQLite Viewer PRO.</p>
          <div class="text-center mt-24">
            <a href="https://marketplace.visualstudio.com/items/qwtel.sqlite-viewer/changelog" target="_blank" class="button button-sm">
              <span data-i18n-key="view-full-changelog">View Full Changelog</span>&nbsp;↗
            </a>
          </div>
        </div>
      </div>
    </sl-carousel-item>
  `;
  
  return html`
    <section class="changelog-carousel section">
      <div class="container">
        <div class="section-inner">
          <div class="text-center mb-48">
            <h3 class="h3 mt-0 color-unset" data-i18n-key="changelog-title">Recent Updates</h3>
            <p class="section-paragraph mb-0 text-sm" data-i18n-key="changelog-subtitle">
              Stay up to date with the latest features and improvements in SQLite Viewer PRO.
            </p>
          </div>
          <div class="carousel-container">
            <sl-carousel pagination navigation loop autoplay autoplay-interval="5000">
              ${carouselItems}
              ${fixedItem}
          </div>
        </div>
      </div>
    </section>
  `;
}

async function integrateCarousel() {
  // Generate the carousel HTML
  const carouselHTML = await generateCarouselHTML();
  if (!carouselHTML) return;

  const indexPath = resolve('src', 'index.html');
  const indexContent = await Bun.file(indexPath).text();
  
  let contentWithLazyLoad = indexContent;
  
  if (!indexContent.includes('changelog-carousel')) {
    console.log('ℹ️ Adding lazy loading script to the head section...');
    const headEnd = indexContent.indexOf('</head>');
    contentWithLazyLoad = 
      indexContent.substring(0, headEnd) + 
      '\n' + 
      indexContent.substring(headEnd);
  }

  // Check if carousel already exists
  if (indexContent.includes('changelog-carousel section')) {
    console.log('ℹ️ Changelog carousel already exists, updating content...');
    
    // Use regex to find and remove all carousel sections
    const carouselRegex = /<section class="changelog-carousel section">[\s\S]*?<\/section>\s*/g;
    let newContent = contentWithLazyLoad.replace(carouselRegex, '');
    
    // Now insert the new carousel after the proof section
    const proofSectionEnd = newContent.indexOf('</section>', newContent.indexOf('<section class="proof section">'));
    const insertPosition = proofSectionEnd + '</section>'.length;
    
    const newCarouselHTML = await generateCarouselHTML();
    newContent = 
      newContent.substring(0, insertPosition) + 
      '\n\n      ' + 
      newCarouselHTML + 
      '\n\n      ' + 
      newContent.substring(insertPosition);
    
    await Bun.write(indexPath, newContent);
    console.log('✅ Changelog carousel updated successfully!');
  } else {
    // Find the proof section and insert the carousel after it
    const proofSectionEnd = contentWithLazyLoad.indexOf('</section>', contentWithLazyLoad.indexOf('<section class="proof section">'));
    const insertPosition = proofSectionEnd + '</section>'.length;
    
    // Insert the carousel HTML after the proof section
    const newContent = 
      contentWithLazyLoad.substring(0, insertPosition) + 
      '\n\n      ' + 
      carouselHTML + 
      '\n\n      ' + 
      contentWithLazyLoad.substring(insertPosition);
    
    // Write the updated content back to the file
    await Bun.write(indexPath, newContent);
    
    console.log('✅ Changelog carousel integrated successfully!');
  }
}

// Run the integration
await integrateCarousel(); 

//#region utils
function html(strings: TemplateStringsArray, ...values: any[]) {
  let str = '';
  strings.forEach((string, i) => {
    str += string + (values[i] ?? '');
  });
  return str.trimEnd();
}
//#endregion