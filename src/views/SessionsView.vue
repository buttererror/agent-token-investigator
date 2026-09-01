<script setup>
import SessionList from '../components/SessionList.vue';

const props = defineProps({
  sessions: {
    type: Array,
    default: () => []
  }
});

defineEmits(['inspect-session']);
</script>

<template>
  <div class="sessions-view">
    <SessionList 
      :sessions="sessions" 
      @inspect-session="s => $emit('inspect-session', s)"
    />
  </div>
</template>

<style scoped>
.sessions-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
</style>
