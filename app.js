const EXPORT_HTML_PATH = "export/WarframeArbitrationsGuide.html";

let searchHits = [];
let currentSearchIndex = -1;
let observer = null;

async function loadGuide() {
  const content = document.getElementById("content");

  try {
    const response = await fetch(EXPORT_HTML_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load export HTML (${response.status})`);
    }

    const rawHtml = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");

    installExportStyles(doc);
    rewriteRelativeImages(doc);
    unwrapGoogleRedirectLinks(doc);

    const outline = extractOutlineLinks(doc);

    content.innerHTML = `<div class="google-export">${doc.body.innerHTML}</div>`;

    buildSidebar(outline);
    setupSectionObserver();
    setupImages();
  } catch (error) {
    console.error(error);
    content.innerHTML = `<p>Failed to load the guide content.</p>`;
  }
}

function installExportStyles(doc) {
  document.querySelectorAll("[data-export-style]").forEach((el) => el.remove());

  doc.querySelectorAll("style, link[rel='stylesheet']").forEach((el) => {
    const clone = el.cloneNode(true);

    if (clone.tagName === "LINK") {
      const href = clone.getAttribute("href");
      if (href && !/^(https?:|data:|\/)/i.test(href)) {
        clone.setAttribute("href", `export/${href.replace(/^\.?\//, "")}`);
      }
    }

    clone.setAttribute("data-export-style", "1");
    document.head.appendChild(clone);
  });
}

function rewriteRelativeImages(doc) {
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (!src) return;

    if (/^(https?:|data:)/i.test(src)) return;

    img.setAttribute("src", `export/${src.replace(/^\.?\//, "")}`);
  });
}

function unwrapGoogleRedirectLinks(doc) {
  doc.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href) return;

    if (href.startsWith("https://www.google.com/url?q=")) {
      try {
        const url = new URL(href);
        const actual = url.searchParams.get("q");
        if (actual) {
          a.setAttribute("href", actual);
        }
      } catch (err) {
        console.warn("Failed to unwrap redirect:", href, err);
      }
    }
  });
}

function extractOutlineLinks(doc) {
  const anchors = Array.from(doc.body.querySelectorAll('a[href^="#h."]'));
  const outline = [];
  const seen = new Set();

  for (const a of anchors) {
    const href = a.getAttribute("href");
    const text = a.textContent.trim();

    if (!href || !text) continue;
    if (seen.has(href)) continue;

    seen.add(href);

    outline.push({
      href,
      text,
      depth: getDepthFromText(text)
    });
  }

  return outline;
}

function getDepthFromText(text) {
  if (
    text === "Warframes:" ||
    text === "Weapons" ||
    text === "Companions" ||
    text === "Gear Items" ||
    text === "Arbitration Tilesets" ||
    text === "Miscellaneous" ||
    text === "Pre-Buffing Before Mission" ||
    text === "AURA CHOICE"
  ) {
    return 0;
  }

  if (
    text.startsWith("Primary:") ||
    text.startsWith("Secondary:") ||
    text.startsWith("Melee:") ||
    text === "CLIENT Cyte" ||
    text === "Jade" ||
    text === "Nidus Prime"
  ) {
    return 2;
  }

  return 1;
}

function buildSidebar(outline) {
  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = "";

  outline.forEach((item) => {
    const link = document.createElement("a");
    link.href = item.href;
    link.textContent = item.text;
    link.className = `depth-${item.depth}`;

    link.addEventListener("click", (event) => {
      event.preventDefault();
      const target = document.querySelector(item.href);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    sidebar.appendChild(link);
  });
}

function setupSectionObserver() {
  const links = Array.from(document.querySelectorAll("#sidebar a"));
  const targets = links
    .map((link) => {
      const selector = link.getAttribute("href");
      const target = document.querySelector(selector);
      if (!target) return null;
      return { link, target };
    })
    .filter(Boolean);

  if (observer) observer.disconnect();

  observer = new IntersectionObserver(
    (entries) => {
      let best = null;

      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (!best || entry.boundingClientRect.top < best.boundingClientRect.top) {
          best = entry;
        }
      }

      if (!best) return;

      links.forEach((link) => link.classList.remove("active"));

      const match = targets.find((item) => item.target === best.target);
      if (match) {
        match.link.classList.add("active");
      }
    },
    {
      rootMargin: "-18% 0px -68% 0px",
      threshold: [0, 1]
    }
  );

  targets.forEach((item) => observer.observe(item.target));
}

function setupImages() {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");

  lightbox.replaceWith(lightbox.cloneNode(true));
  const freshLightbox = document.getElementById("lightbox");
  const freshLightboxImg = document.getElementById("lightboxImg");

  document.querySelectorAll("#content img").forEach((img) => {
    img.addEventListener("click", () => {
      freshLightboxImg.src = img.src;
      freshLightbox.hidden = false;
    });
  });

  freshLightbox.addEventListener("click", () => {
    freshLightbox.hidden = true;
    freshLightboxImg.removeAttribute("src");
  });
}

function clearSearchHighlights() {
  document.querySelectorAll("mark.search-hit").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
    parent.normalize();
  });

  searchHits = [];
  currentSearchIndex = -1;
}

function highlightSearch(term) {
  clearSearchHighlights();
  if (!term.trim()) return;

  const root = document.getElementById("content");
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "gi");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  const textNodes = [];
  let node;

  while ((node = walker.nextNode())) {
    if (!node.nodeValue.trim()) continue;

    const parentName = node.parentNode?.nodeName?.toLowerCase();
    if (["script", "style", "mark"].includes(parentName)) continue;

    if (regex.test(node.nodeValue)) {
      textNodes.push(node);
    }
    regex.lastIndex = 0;
  }

  for (const textNode of textNodes) {
    const text = textNode.nodeValue;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (start > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
      }

      const mark = document.createElement("mark");
      mark.className = "search-hit";
      mark.textContent = text.slice(start, end);
      frag.appendChild(mark);
      searchHits.push(mark);

      lastIndex = end;
    }

    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.parentNode.replaceChild(frag, textNode);
    regex.lastIndex = 0;
  }
}

function goToSearchHit(direction) {
  const term = document.getElementById("searchBox").value;
  if (!term.trim()) return;

  if (searchHits.length === 0) {
    highlightSearch(term);
  }

  if (searchHits.length === 0) return;

  currentSearchIndex = (currentSearchIndex + direction + searchHits.length) % searchHits.length;
  const hit = searchHits[currentSearchIndex];
  hit.scrollIntoView({ behavior: "smooth", block: "center" });
}

function bindSearch() {
  document.getElementById("searchNextBtn").addEventListener("click", () => goToSearchHit(1));
  document.getElementById("searchPrevBtn").addEventListener("click", () => goToSearchHit(-1));

  document.getElementById("searchBox").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      goToSearchHit(1);
    }
  });

  document.getElementById("searchBox").addEventListener("input", () => {
    clearSearchHighlights();
  });
}

bindSearch();
loadGuide();