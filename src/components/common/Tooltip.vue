<script setup>
import { ref } from 'vue';

const props = defineProps({
  text: {
    type: String,
    required: true
  },
  title: {
    type: String,
    default: ''
  },
  whyItMatters: {
    type: String,
    default: ''
  },
  placement: {
    type: String,
    default: 'top' // 'top' or 'bottom'
  }
});

const isVisible = ref(false);
</script>

<template>
  <span class="tooltip-container" @mouseenter="isVisible = true" @mouseleave="isVisible = false">
    <slot>
      <span class="tooltip-trigger" role="button" aria-label="More information">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </span>
    </slot>
    <div 
      :class="['tooltip-content', `placement-${placement}`, { 'visible': isVisible }]"
    >
      <div v-if="title" class="tooltip-title">{{ title }}</div>
      <div class="tooltip-body">{{ text }}</div>
      <div v-if="whyItMatters" class="tooltip-why">
        <strong>Why it matters:</strong> {{ whyItMatters }}
      </div>
    </div>
  </span>
</template>

<style scoped>
.tooltip-container {
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
}

.tooltip-trigger {
  color: var(--text-dim);
  cursor: help;
  display: inline-flex;
  align-items: center;
}

.tooltip-trigger:hover {
  color: var(--accent-blue);
}

.tooltip-content {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  background-color: #1e293b;
  color: var(--text-main);
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.78rem;
  line-height: 1.45;
  white-space: normal;
  width: 260px;
  max-width: 85vw;
  border: 1px solid #334155;
  box-shadow: 0 12px 28px rgba(0,0,0,0.7);
  z-index: 9999;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s ease, visibility 0.15s;
}

.placement-top {
  bottom: 130%;
}

.placement-bottom {
  top: 130%;
  bottom: auto;
}

.tooltip-content.visible {
  opacity: 1;
  visibility: visible;
}

.tooltip-title {
  font-weight: 700;
  color: var(--accent-blue);
  margin-bottom: 4px;
  font-size: 0.82rem;
}

.tooltip-why {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.1);
  color: var(--text-muted);
  font-size: 0.75rem;
}
</style>
