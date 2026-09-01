<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  },
  glossary: {
    type: Array,
    default: () => []
  }
});

defineEmits(['close']);

const searchQuery = ref('');
const selectedCategory = ref('All');

const categories = computed(() => {
  const cats = new Set(['All']);
  props.glossary.forEach(g => {
    if (g.category) cats.add(g.category);
  });
  return Array.from(cats);
});

const filteredGlossary = computed(() => {
  return props.glossary.filter(item => {
    const matchesCat = selectedCategory.value === 'All' || item.category === selectedCategory.value;
    const q = searchQuery.value.toLowerCase();
    const matchesSearch = !q || 
      item.term.toLowerCase().includes(q) || 
      item.description.toLowerCase().includes(q) ||
      item.whyItMatters.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });
});
</script>

<template>
  <div v-if="isOpen" class="drawer-overlay" @click="$emit('close')">
    <div class="drawer-panel" @click.stop>
      <div class="drawer-header">
        <div class="drawer-title-group">
          <h2>📖 Agent Token Guide & Glossary</h2>
          <span class="drawer-sub">Demystifying AI Agent Accounting & Optimization</span>
        </div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>

      <div class="drawer-search">
        <input 
          v-model="searchQuery" 
          type="text" 
          placeholder="Search concepts (e.g. cached tokens, noise, rate limits)..."
          class="search-input"
        />
      </div>

      <div class="category-pills">
        <button 
          v-for="cat in categories" 
          :key="cat"
          :class="['cat-pill', { active: selectedCategory === cat }]"
          @click="selectedCategory = cat"
        >
          {{ cat }}
        </button>
      </div>

      <div class="terms-list">
        <div v-for="item in filteredGlossary" :key="item.term" class="term-card card">
          <div class="term-head">
            <span class="term-name">{{ item.term }}</span>
            <span class="term-category badge badge-blue">{{ item.category }}</span>
          </div>
          <p class="term-desc">{{ item.description }}</p>
          <div class="term-why">
            <strong>💡 Why It Matters:</strong> {{ item.whyItMatters }}
          </div>
          <div v-if="item.tip" class="term-tip">
            <strong>🎯 Best Practice:</strong> {{ item.tip }}
          </div>
        </div>

        <div v-if="filteredGlossary.length === 0" class="empty-state">
          No matching concepts found.
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.drawer-title-group h2 {
  font-size: 1.3rem;
  font-weight: 800;
}

.drawer-sub {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 1.3rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s;
}

.close-btn:hover {
  background-color: #1e293b;
  color: var(--text-main);
}

.drawer-search {
  margin-bottom: 16px;
}

.search-input {
  width: 100%;
  padding: 10px 14px;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-main);
  font-size: 0.85rem;
  outline: none;
}

.search-input:focus {
  border-color: var(--border-focus);
}

.category-pills {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.cat-pill {
  padding: 4px 10px;
  background-color: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: 9999px;
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.cat-pill.active {
  background: var(--accent-blue);
  color: #0b0f19;
  border-color: var(--accent-blue);
}

.terms-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.term-card {
  padding: 16px;
}

.term-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.term-name {
  font-weight: 700;
  font-size: 1rem;
  color: var(--accent-blue);
}

.term-desc {
  font-size: 0.85rem;
  color: var(--text-main);
  line-height: 1.4;
  margin-bottom: 8px;
}

.term-why {
  font-size: 0.8rem;
  color: var(--text-muted);
  background-color: rgba(56, 189, 248, 0.05);
  padding: 8px 10px;
  border-radius: 6px;
  margin-bottom: 6px;
  border-left: 3px solid var(--accent-blue);
}

.term-tip {
  font-size: 0.8rem;
  color: var(--text-muted);
  background-color: rgba(34, 197, 94, 0.05);
  padding: 8px 10px;
  border-radius: 6px;
  border-left: 3px solid var(--accent-green);
}

.empty-state {
  text-align: center;
  color: var(--text-dim);
  padding: 40px 0;
  font-size: 0.9rem;
}
</style>
