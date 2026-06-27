// src/utils/aria.ts
var idCounter = 0;
function generateId(prefix = "kiwa-ui") {
  return `${prefix}-${++idCounter}`;
}
function linkAriaControls(trigger, content) {
  let contentId = content.id;
  if (!contentId) {
    contentId = generateId("content");
    content.id = contentId;
  }
  trigger.setAttribute("aria-controls", contentId);
  return contentId;
}
function linkAriaDescribedby(element, description) {
  let descId = description.id;
  if (!descId) {
    descId = generateId("desc");
    description.id = descId;
  }
  element.setAttribute("aria-describedby", descId);
  return descId;
}
function setAriaHiddenSiblings(container, hidden) {
  const siblings = Array.from(document.body.children).filter(
    (el) => el !== container && el.tagName !== "SCRIPT" && el.tagName !== "STYLE"
  );
  siblings.forEach((sibling) => {
    if (hidden) {
      const currentHidden = sibling.getAttribute("aria-hidden");
      if (currentHidden !== "true") {
        sibling.setAttribute("data-aria-hidden-by-modal", currentHidden || "");
        sibling.setAttribute("aria-hidden", "true");
      }
    } else {
      const previousValue = sibling.getAttribute("data-aria-hidden-by-modal");
      sibling.removeAttribute("data-aria-hidden-by-modal");
      if (previousValue) {
        sibling.setAttribute("aria-hidden", previousValue);
      } else {
        sibling.removeAttribute("aria-hidden");
      }
    }
  });
}

export {
  generateId,
  linkAriaControls,
  linkAriaDescribedby,
  setAriaHiddenSiblings
};
