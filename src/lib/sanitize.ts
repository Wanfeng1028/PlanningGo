import DOMPurify from "dompurify";
import { marked } from "marked";

// Configure marked for safe rendering
marked.setOptions({
  breaks: true, // Convert \n to <br>
  gfm: true, // GitHub Flavored Markdown
});

// Configure DOMPurify to allow safe HTML elements
DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
  // Allow safe href attributes
  if (data.attrName === "href") {
    const href = data.attrValue;
    // Only allow http, https, and mailto protocols
    if (
      !href.startsWith("http://") &&
      !href.startsWith("https://") &&
      !href.startsWith("mailto:")
    ) {
      data.keepAttr = false;
    }
  }
});

export function sanitizeMarkdown(markdown: string): string {
  if (!markdown) return "";

  try {
    // First parse markdown to HTML
    const html = marked.parse(markdown) as string;
    // Then sanitize the HTML to prevent XSS
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "strong",
        "em",
        "u",
        "a",
        "ul",
        "ol",
        "li",
        "code",
        "pre",
        "blockquote",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
      ],
      ALLOWED_ATTR: ["href", "class"],
      ALLOW_DATA_ATTR: false,
    });
  } catch (error) {
    console.error("[Sanitize] Error parsing markdown:", error);
    // Fallback to plain text if parsing fails
    return DOMPurify.sanitize(markdown);
  }
}

export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "a", "span"],
    ALLOWED_ATTR: ["href", "class"],
    ALLOW_DATA_ATTR: false,
  });
}
