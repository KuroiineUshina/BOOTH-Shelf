export function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      if (value !== null && value !== undefined) node.setAttribute(name, String(value));
    }
  }
  return node;
}

export function lucideIcon(name, className = "") {
  return element("span", {
    className: `${className ? `${className} ` : ""}licon licon-${name}`,
    attrs: { "aria-hidden": "true" },
  });
}

export function setLucideIcon(node, name) {
  if (!node) return;
  for (const className of [...node.classList]) {
    if (className.startsWith("licon-")) node.classList.remove(className);
  }
  node.classList.add("licon", `licon-${name}`);
}
