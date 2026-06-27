import {
  generateId,
  linkAriaControls
} from "./chunk-7CQYLTMT.js";

// src/accordion.ts
function accordion() {
  const accordions = document.querySelectorAll("[data-accordion]");
  accordions.forEach((accordion2) => {
    const type = accordion2.dataset.accordionType || "single";
    const items = Array.from(
      accordion2.querySelectorAll("[data-accordion-item]")
    );
    const openItems = /* @__PURE__ */ new Set();
    items.forEach((item) => {
      const itemId = item.dataset.accordionItem;
      if (!itemId) return;
      const trigger = item.querySelector("[data-accordion-trigger]");
      const content = item.querySelector("[data-accordion-content]");
      if (!trigger || !content) return;
      const triggerId = generateId("accordion-trigger");
      trigger.id = triggerId;
      trigger.setAttribute("aria-expanded", "false");
      linkAriaControls(trigger, content);
      content.setAttribute("role", "region");
      content.setAttribute("aria-labelledby", triggerId);
      content.dataset.state = "closed";
      const isOpen = () => openItems.has(itemId);
      const open = () => {
        if (type === "single") {
          openItems.forEach((openId) => {
            if (openId !== itemId) {
              closeItem(openId);
            }
          });
        }
        openItems.add(itemId);
        trigger.setAttribute("aria-expanded", "true");
        content.dataset.state = "open";
        item.dataset.state = "open";
      };
      const close = () => {
        openItems.delete(itemId);
        trigger.setAttribute("aria-expanded", "false");
        content.dataset.state = "closed";
        item.dataset.state = "closed";
      };
      const closeItem = (id) => {
        const targetItem = items.find((i) => i.dataset.accordionItem === id);
        if (!targetItem) return;
        const targetTrigger = targetItem.querySelector("[data-accordion-trigger]");
        const targetContent = targetItem.querySelector("[data-accordion-content]");
        if (targetTrigger && targetContent) {
          openItems.delete(id);
          targetTrigger.setAttribute("aria-expanded", "false");
          targetContent.dataset.state = "closed";
          targetItem.dataset.state = "closed";
        }
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
      if (item.dataset.state === "open" || item.hasAttribute("data-default-open")) {
        open();
      }
    });
    accordion2.addEventListener("keydown", (e) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const triggers = items.map((item) => item.querySelector("[data-accordion-trigger]")).filter((t) => t !== null);
      const currentIndex = triggers.findIndex((t) => t === document.activeElement);
      if (currentIndex === -1) return;
      e.preventDefault();
      let nextIndex = currentIndex;
      switch (e.key) {
        case "ArrowDown":
          nextIndex = (currentIndex + 1) % triggers.length;
          break;
        case "ArrowUp":
          nextIndex = (currentIndex - 1 + triggers.length) % triggers.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = triggers.length - 1;
          break;
      }
      triggers[nextIndex]?.focus();
    });
  });
}

export {
  accordion
};
