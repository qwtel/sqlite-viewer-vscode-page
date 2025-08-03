/// <reference types="bun-types" />

import URL from 'url';
import path from 'path';
import { marked } from 'marked';
import { html } from './_utils';

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
  
  return releases;
}

async function parseAllReleases(): Promise<Release[]|null> {
  const releases = await parseChangelog();
  if (!releases) return null;
  
  // Return all releases (not just the first 5)
  return releases;
}

async function parseRecentReleases(): Promise<Release[]|null> {
  const releases = await parseChangelog();
  if (!releases) return null;
  
  // Return the 5 most recent releases
  return releases.slice(0, 5);
}

async function processReleaseContent(content: string, headlineAdjustment: number = 2): Promise<string> {
  // Clean up the content - preserve paragraph breaks
  const cleanContent = content.trim();
  
  // Add specified levels to each headline
  const contentWithAdjustedHeadlines = cleanContent.replace(/^(#{1,6})\s/gm, (match, hashes) => {
    return '#'.repeat(Math.min(hashes.length + headlineAdjustment, 6)) + ' ';
  });
  
  // Parse markdown content
  let parsedContent = await marked.parse(contentWithAdjustedHeadlines, { 
    gfm: true,
    breaks: false
  });
  
  // Replace [PRO] with sl-badge elements
  parsedContent = parsedContent.replace(/\[PRO\]/g, html`<sl-badge variant="primary" size="small">PRO</sl-badge>`);
  
  return parsedContent;
}

function generateMarkdownId(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

function formatVersionWithBadge(version: string): string {
  // Replace (Pre-Release) with Preview badge in version
  let versionWithBadge = version.replace(/\(Pre-Release\)/g, html`<sl-badge variant="neutral" size="small">Preview</sl-badge>`);
  
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
  
  return versionWithBadge;
}

function formatVersionWithBadgeAndId(version: string): { html: string; id: string } {
  // Generate ID from the version string (keeping pre-release part, removing date)
  const versionOnly = version.split(' - ')[0]; // Remove date part
  const id = generateMarkdownId(versionOnly);
  
  // Replace (Pre-Release) with Preview badge in version
  let versionWithBadge = version.replace(/\(Pre-Release\)/g, html`<sl-badge variant="neutral" size="small">Preview</sl-badge>`);
  
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
  
  return { html: versionWithBadge, id };
}

async function generateCarouselHTML(): Promise<string|null> {
  const releases = await parseRecentReleases();
  if (!releases) return null;
  
  let carouselItems = '';
  
  for (const release of releases) {
    const parsedContent = await processReleaseContent(release.content, 2);
    const { html: versionWithBadge, id } = formatVersionWithBadgeAndId(release.version);
    
    carouselItems += html`
      <sl-carousel-item>
        <div class="changelog-card changelog-card-landing">
          <div class="changelog-header">
            <h4 class="changelog-version" id="${id}">${versionWithBadge}</h4>
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
      <div class="changelog-card changelog-card-landing">
        <div class="changelog-header">
          <h4 class="changelog-version" id="full-version-history"><span class="version-number">Full Version History</span></h4>
        </div>
        <div class="changelog-content text-sm">
          <p>Browse the complete changelog to see all features, bug fixes, and improvements across every version of SQLite Viewer PRO.</p>
          <div class="text-center mt-24">
            <a href="./changelog.html" class="button button-sm">
              <span data-i18n-key="view-full-changelog">View Full Changelog</span>
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

async function generateFullChangelogHTML(): Promise<string|null> {
  const releases = await parseAllReleases();
  if (!releases) return null;
  
  let changelogContent = '';
  
  for (const release of releases) {
    const parsedContent = await processReleaseContent(release.content, 1);
    const { html: versionWithBadge, id } = formatVersionWithBadgeAndId(release.version);
    
    changelogContent += html`
      <div class="changelog-card changelog-card-full">
        <div class="changelog-header">
          <h3 class="changelog-version" id="${id}">${versionWithBadge}</h3>
        </div>
        <div class="changelog-content">
          ${parsedContent}
        </div>
      </div>
    `;
  }
  
  return html`
    <section class="section">
      <h1 class="mb-64">Changelog</h1>
      <!-- <p class="section-paragraph mb-0 text-sm">
        All features, bug fixes, and improvements across every version of SQLite Viewer PRO.
      </p> -->
      <div class="changelog-carousel">
        <div class="changelog-entries">
          ${changelogContent}
        </div>
      </div>
    </section>
  `;
}

async function generateChangelogPage(): Promise<void> {
  const templatePath = resolve('_template.html');
  const changelogPath = resolve('changelog.html');
  
  if (!await Bun.file(templatePath).exists()) {
    console.log('Template file not found, skipping changelog page generation');
    return;
  }
  
  const templateContent = await Bun.file(templatePath).text();
  const changelogHTML = await generateFullChangelogHTML();
  
  if (!changelogHTML) {
    console.log('No changelog content found, skipping changelog page generation');
    return;
  }
  
  // Replace the content div with our changelog content
  const contentDivRegex = /<div id="content" class="container">\s*<\/div>/;
  const newContent = templateContent.replace(contentDivRegex, `<div id="content" class="container">${changelogHTML}</div>`);
  
  // Add Shoelace stylesheets to the head section
  const headEnd = newContent.indexOf('</head>');
  const shoelaceStylesheets = `
  <link rel="stylesheet" media="(prefers-color-scheme:light)" href="https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/themes/light.css"/>
  <link rel="stylesheet" media="(prefers-color-scheme:dark)" href="https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/themes/dark.css"/>
  <script type="module" src="https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/shoelace.js"></script>`;
  
  const contentWithStylesheets = newContent.substring(0, headEnd) + shoelaceStylesheets + '\n  ' + newContent.substring(headEnd);
  
  // Add dark mode functionality before the closing body tag
  const darkModeScript = `
  <script type="module">
    const darkMode = window.matchMedia('(prefers-color-scheme: dark)');
    darkMode.addEventListener('change', (ev) => document.documentElement.classList.toggle('sl-theme-dark', ev.matches));
    if (darkMode.matches) document.documentElement.classList.add('sl-theme-dark');
  </script>`;
  
  // Insert the script before the closing body tag
  const bodyEnd = contentWithStylesheets.lastIndexOf('</body>');
  const updatedContent = contentWithStylesheets.substring(0, bodyEnd) + darkModeScript + '\n  ' + contentWithStylesheets.substring(bodyEnd);
  
  // Update the title and meta tags
  const finalContent = updatedContent
    .replace(/<title[^>]*>.*?<\/title>/g, '<title>Complete Changelog - SQLite Viewer PRO for VS Code</title>')
    .replace(/<meta property="og:title"[^>]*>/g, '<meta property="og:title" content="Complete Changelog - SQLite Viewer PRO for VS Code">')
    .replace(/<meta name="twitter:title"[^>]*>/g, '<meta name="twitter:title" content="Complete Changelog - SQLite Viewer PRO for VS Code">')
    .replace(/<meta property="og:description"[^>]*>/g, '<meta property="og:description" content="All features, bug fixes, and improvements across every version of SQLite Viewer PRO.">')
    .replace(/<meta name="twitter:description"[^>]*>/g, '<meta name="twitter:description" content="All features, bug fixes, and improvements across every version of SQLite Viewer PRO.">');
  
  await Bun.write(changelogPath, finalContent);
  console.log('Changelog page generated successfully!');
}

async function integrateCarousel() {
  // Generate the carousel HTML
  const carouselHTML = await generateCarouselHTML();
  if (!carouselHTML) return;

  const indexPath = resolve('src', 'index.html');
  const indexContent = await Bun.file(indexPath).text();
  
  let contentWithLazyLoad = indexContent;
  
  if (!indexContent.includes('changelog-carousel')) {
    console.log('Adding lazy loading script to the head section...');
    const headEnd = indexContent.indexOf('</head>');
    contentWithLazyLoad = 
      indexContent.substring(0, headEnd) + 
      '\n' + 
      indexContent.substring(headEnd);
  }

  // Check if carousel already exists
  if (indexContent.includes('changelog-carousel section')) {
    console.log('Changelog carousel already exists, updating content...');
    
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
    console.log('Changelog carousel updated successfully!');
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
    
    console.log('Changelog carousel integrated successfully!');
  }
}

// Run both integrations
await integrateCarousel();
await generateChangelogPage(); 
