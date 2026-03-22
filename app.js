let searchHits = [];
let currentSearchIndex = -1;
let observer = null;

async function loadGuide() {
  const content = document.getElementById("content");

  try {
    const response = await fetch("guide-content.html", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load guide-content.html (${response.status})`);
    }

    const html = await response.text();
    content.innerHTML = html;

    postProcessGuide();
  } catch (error) {
    console.error(error);
    content.innerHTML = `<p>Failed to load the guide content.</p>`;
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function ensureHeadingIds() {
  const headings = document.querySelectorAll("#content h1, #content h2, #content h3");
  const used = new Set();

  headings.forEach((heading, index) => {
    let id = heading.id?.trim() || slugify(heading.textContent) || `section-${index}`;
    while (used.has(id)) {
      id += "-x";
    }
    used.add(id);
    heading.id = id;
  });
}

function buildSidebar() {
  const sidebar = document.getElementById("sidebar");
  const headings = document.querySelectorAll("#content h1, #content h2, #content h3");

  sidebar.innerHTML = "";

  headings.forEach((heading) => {
    const link = document.createElement("a");
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent.trim() || heading.id;
    link.className = `nav-${heading.tagName.toLowerCase()}`;
    sidebar.appendChild(link);
  });
}

function setupSectionObserver() {
  const links = Array.from(document.querySelectorAll("#sidebar a"));
  const headingMap = new Map(links.map((link) => [link.getAttribute("href")?.slice(1), link]));

  if (observer) observer.disconnect();

  observer = new IntersectionObserver(
    (entries) => {
      let topMost = null;

      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (!topMost || entry.boundingClientRect.top < topMost.boundingClientRect.top) {
            topMost = entry;
          }
        }
      }

      if (!topMost) return;

      links.forEach((link) => link.classList.remove("active"));
      const active = headingMap.get(topMost.target.id);
      if (active) active.classList.add("active");
    },
    {
      rootMargin: "-20% 0px -65% 0px",
      threshold: [0, 1]
    }
  );

  document.querySelectorAll("#content h1, #content h2, #content h3").forEach((heading) => {
    observer.observe(heading);
  });
}

function setupImages() {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");

  document.querySelectorAll("#content img").forEach((img) => {
    img.addEventListener("click", () => {
      lightboxImg.src = img.src;
      lightbox.hidden = false;
    });
  });

  lightbox.addEventListener("click", () => {
    lightbox.hidden = true;
    lightboxImg.removeAttribute("src");
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

function highlightSearchTerm(term) {
  clearSearchHighlights();
  if (!term.trim()) return;

  const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const root = document.getElementById("content");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  const textNodes = [];
  let node;

  while ((node = walker.nextNode())) {
    if (!node.nodeValue.trim()) continue;

    const parentTag = node.parentNode?.nodeName?.toLowerCase();
    if (["script", "style", "mark"].includes(parentTag)) continue;

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
    highlightSearchTerm(term);
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

function postProcessGuide() {
  ensureHeadingIds();
  buildSidebar();
  setupSectionObserver();
  setupImages();
}

bindSearch();
loadGuide();