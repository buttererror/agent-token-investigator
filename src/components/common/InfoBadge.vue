<script setup>
defineProps({
  type: {
    type: String,
    default: 'blue' // green, yellow, red, blue, purple
  },
  label: {
    type: String,
    required: true
  }
});
</script>

<template>
  <span :class="['badge', `badge-${type}`]">
    <span class="badge-dot"></span>
    {{ label }}
  </span>
</template>

<style scoped>
.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: currentColor;
}
</style>
