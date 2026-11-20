let articlesPromise;

async function readArticles() {
  const response = await fetch('/rss.xml');
  if (!response.ok) throw new Error('无法加载文章订阅');
  const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
  const channel = xml.querySelector('rss > channel');
  if (!channel) throw new Error('文章订阅格式异常');

  const articles = [];
  for (const item of channel.querySelectorAll('item')) {
    const title = item.querySelector('title')?.textContent.trim();
    const link = item.querySelector('link')?.textContent.trim();
    if (!title || !link) continue;
    const path = new URL(link, location.href).pathname;
    if (!path.startsWith('/posts/')) continue;

    const description = item.querySelector('description')?.textContent.trim() || '';
    const content = item.getElementsByTagNameNS('http://purl.org/rss/1.0/modules/content/', 'encoded')[0];
    const template = document.createElement('template');
    template.innerHTML = content?.textContent || '';
    const body = template.content.textContent.replace(/\s+/g, ' ').trim();
    articles.push({ path, title, description, body });
  }
  return articles;
}

function loadArticles() {
  articlesPromise ??= readArticles().catch(error => {
    articlesPromise = undefined;
    throw error;
  });
  return articlesPromise;
}

class SiteSearch extends HTMLElement {
  connectedCallback() {
    this.listeners = new AbortController();
    const options = { signal: this.listeners.signal };
    this.innerHTML = `
      <details>
        <summary id="search-switch" class="btn-plain rounded-lg">搜索</summary>
        <div id="search-panel" class="site-search-panel">
          <label>搜索文章<input type="search" placeholder="输入标题或正文关键词"></label>
          <p role="status"></p>
          <ul></ul>
        </div>
      </details>`;
    const details = this.querySelector('details');
    const input = this.querySelector('input');
    const status = this.querySelector('[role="status"]');
    const list = this.querySelector('ul');
    let revision = 0;

    const search = async () => {
      const currentRevision = ++revision;
      const query = input.value.trim().toLowerCase();
      list.replaceChildren();
      status.textContent = '';
      if (!query || !details.open) return;
      status.textContent = '正在查询…';
      try {
        const articles = await loadArticles();
        if (currentRevision !== revision || !this.isConnected || !details.open) return;
        const terms = query.split(/\s+/);
        const matches = articles.filter(({ title, description, body }) => {
          const text = [title, description, body].join(' ').toLowerCase();
          return terms.every(term => text.includes(term));
        });
        matches.sort((a, b) => Number(b.title.toLowerCase().includes(query)) -
                               Number(a.title.toLowerCase().includes(query)));
        for (const { path, title, description } of matches) {
          const row = document.createElement('li');
          const link = document.createElement('a');
          link.href = path;
          link.dataset.noSwup = '';
          link.textContent = title;
          const summary = document.createElement('small');
          summary.textContent = description;
          link.append(summary);
          row.append(link);
          list.append(row);
        }
        status.textContent = matches.length ? `找到 ${matches.length} 篇文章` : '没有找到相关文章';
      } catch {
        if (currentRevision === revision && details.open) status.textContent = '加载失败，请重新输入关键词重试。';
      }
    };

    input.addEventListener('input', search, options);
    details.addEventListener('toggle', () => {
      if (details.open) {
        // The shared navigation closes floating panels on outside clicks.
        this.querySelector('#search-panel').classList.remove('float-panel-closed');
        input.focus();
        search();
      } else {
        revision++;
      }
    }, options);
    this.addEventListener('keydown', event => {
      if (event.key === 'Escape' && details.open) {
        event.preventDefault();
        details.open = false;
        this.querySelector('summary').focus();
      }
    }, options);
    const closeOutside = event => {
      if (!this.contains(event.target)) details.open = false;
    };
    document.addEventListener('pointerdown', closeOutside, options);
    document.addEventListener('focusin', closeOutside, options);
    document.addEventListener('swup:visit:start', () => { details.open = false; }, options);
  }

  disconnectedCallback() {
    this.listeners.abort();
  }
}

if (!customElements.get('site-search')) customElements.define('site-search', SiteSearch);
