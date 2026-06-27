import {
  linkAriaControls
} from "./chunk-7CQYLTMT.js";

// src/collapsible.ts
var collapsibleElements = /* @__PURE__ */ new WeakSet();
function collapsible() {
  const collapsibles = document.querySelectorAll("[data-collapsible]");
  collapsibles.forEach((collapsible2) => {
    if (collapsibleElements.has(collapsible2)) return;
    collapsibleElements.add(collapsible2);
    const trigger = collapsible2.querySelector("[data-collapsible-trigger]");
    const content = collapsible2.querySelector("[data-collapsible-content]");
    if (!trigger || !content) return;
    linkAriaControls(trigger, content);
    trigger.setAttribute("aria-expanded", "false");
    const transitionValue = "max-height 0.2s ease-out";
    const isOpen = () => collapsible2.dataset.state === "open";
    const onTransitionEnd = (e) => {
      if (e.target !== content || e.propertyName !== "max-height") return;
      if (collapsible2.dataset.state === "open") {
        content.style.maxHeight = "none";
      } else {
        content.hidden = true;
      }
    };
    content.addEventListener("transitionend", onTransitionEnd);
    const open = () => {
      collapsible2.dataset.state = "open";
      trigger.dataset.state = "open";
      trigger.setAttribute("aria-expanded", "true");
      content.dataset.state = "open";
      content.hidden = false;
      const height = content.scrollHeight;
      content.style.maxHeight = `${height}px`;
    };
    const close = () => {
      collapsible2.dataset.state = "closed";
      trigger.dataset.state = "closed";
      trigger.setAttribute("aria-expanded", "false");
      content.dataset.state = "closed";
      const height = content.scrollHeight;
      content.style.maxHeight = `${height}px`;
      content.offsetHeight;
      content.style.maxHeight = "0px";
    };
    const toggle = () => {
      if (isOpen()) {
        close();
      } else {
        open();
      }
    };
    trigger.addEventListener("click", toggle);
    trigger.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
    content.style.transition = "none";
    if (collapsible2.hasAttribute("data-default-open") || collapsible2.dataset.state === "open") {
      collapsible2.dataset.state = "open";
      trigger.dataset.state = "open";
      trigger.setAttribute("aria-expanded", "true");
      content.dataset.state = "open";
      content.hidden = false;
      content.style.maxHeight = "none";
    } else {
      collapsible2.dataset.state = "closed";
      trigger.dataset.state = "closed";
      trigger.setAttribute("aria-expanded", "false");
      content.dataset.state = "closed";
      content.hidden = true;
      content.style.maxHeight = "0px";
    }
    requestAnimationFrame(() => {
      content.style.transition = transitionValue;
    });
  });
}

export {
  collapsible
};
