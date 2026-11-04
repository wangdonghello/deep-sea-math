<script setup lang="ts">
import { computed, ref } from 'vue'

import BottomReturnButton from '@/features/navigation/BottomReturnButton.vue'
import { usePet, type PetStore } from '@/features/pet/usePet'
import { DECOR_ITEMS, FOOD_ITEMS, TOY_ITEMS, type PetItem } from '@/data/content/petCatalog'

const props = defineProps<{
  profileId: string | null
  store: PetStore
  clock?: () => number
}>()
const emit = defineEmits<{ (event: 'back-home'): void }>()

const pet = usePet({ store: props.store, profileId: computed(() => props.profileId), clock: props.clock })
const actionError = ref('')
const buying = ref<string | null>(null)

const sections = [
  { id: 'food', title: '食物', hint: '喂食可以增加成长值与饱食度', items: FOOD_ITEMS },
  { id: 'toy', title: '玩具', hint: '解锁“玩耍”，每天可以玩 2 次', items: TOY_ITEMS },
  { id: 'decor', title: '装饰', hint: '买下就会改变宠物房间的样子', items: DECOR_ITEMS },
] as const

const foodCount = computed(() =>
  FOOD_ITEMS.reduce((total, item) => total + (pet.state.value.inventory[item.id] ?? 0), 0),
)

function owned(item: PetItem): boolean {
  return item.kind !== 'food' && pet.state.value.owned.includes(item.id)
}

function count(item: PetItem): number {
  return item.kind === 'food' ? (pet.state.value.inventory[item.id] ?? 0) : 0
}

function canBuy(item: PetItem): boolean {
  return !owned(item) && pet.state.value.points >= item.price
}

function buttonLabel(item: PetItem): string {
  if (owned(item)) return '已拥有'
  return canBuy(item) ? '购买' : '积分不足'
}

function effectText(item: PetItem): string {
  if (item.kind === 'food') return `+${item.xp} XP · 饱食 +${item.hunger}`
  if (item.kind === 'toy') return '玩耍 +6 XP'
  return '房间外观'
}

async function buy(item: PetItem): Promise<void> {
  if (!canBuy(item) || buying.value !== null) return
  buying.value = item.id
  actionError.value = ''
  try {
    await pet.buy(item.id)
  } catch (err) {
    actionError.value = err instanceof Error ? err.message : '这次没买成，再试一次吧'
  } finally {
    buying.value = null
  }
}
</script>

<template>
  <main class="shop" data-testid="shop">
    <div class="shop__glow" aria-hidden="true" />
    <header class="shop__hud">
      <div>
        <p class="shop__eyebrow">深海小铺</p>
        <h1 class="shop__title">给海宠挑点东西</h1>
      </div>
      <div class="shop__wallet" data-testid="shop-points">
        <span class="shop__wallet-icon" aria-hidden="true">✦</span>
        <span>{{ pet.state.value.points }} 积分</span>
      </div>
    </header>

    <p v-if="actionError !== ''" class="shop__error" role="alert" data-testid="shop-error">
      {{ actionError }}
    </p>

    <section
      v-for="section in sections"
      :key="section.id"
      class="shop__section"
      :data-testid="`shop-${section.id}`"
    >
      <header class="shop__section-head">
        <h2>{{ section.title }}</h2>
        <p>{{ section.hint }}</p>
      </header>
      <ul class="shop__grid">
        <li v-for="item in section.items" :key="item.id" class="shop__card">
          <span class="shop__icon" aria-hidden="true">{{ item.icon }}</span>
          <strong class="shop__name">{{ item.name }}</strong>
          <span class="shop__effect">{{ effectText(item) }}</span>
          <span v-if="item.kind === 'food' && count(item) > 0" class="shop__owned">
            背包 ×{{ count(item) }}
          </span>
          <div class="shop__buy-row">
            <span class="shop__price">{{ item.price }} 分</span>
            <button
              type="button"
              class="shop__buy"
              :data-testid="`buy-${item.id}`"
              :disabled="!canBuy(item) || buying !== null"
              @click="buy(item)"
            >
              {{ buying === item.id ? '购买中…' : buttonLabel(item) }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section class="shop__bag" data-testid="shop-bag">
      <h2>背包</h2>
      <p v-if="foodCount === 0" class="shop__bag-empty">还没有食物，先买一份吧。</p>
      <ul v-else class="shop__bag-list">
        <li v-for="item in FOOD_ITEMS" :key="item.id" :hidden="count(item) === 0">
          {{ item.icon }} {{ item.name }} ×{{ count(item) }}
        </li>
      </ul>
    </section>

    <BottomReturnButton label="回宠物房间" test-id="shop-back" @back="emit('back-home')" />
  </main>
</template>

<style scoped>
.shop {
  position: relative;
  display: grid;
  gap: var(--ds-space-lg);
  min-height: 100dvh;
  padding: var(--ds-space-lg) var(--ds-space-md) 8rem;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 18% 0%, rgb(41 106 150 / 35%), transparent 52%),
    radial-gradient(circle at 84% 12%, rgb(28 74 118 / 30%), transparent 48%),
    linear-gradient(180deg, #071523 0%, #04101d 60%, #020a12 100%);
  color: var(--ds-text-primary);
}

.shop__glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 50% 34%, rgb(126 220 255 / 12%), transparent 55%);
}

.shop__hud {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-sm);
  align-items: flex-end;
  justify-content: space-between;
}

.shop__eyebrow {
  margin: 0 0 4px;
  color: var(--ds-accent-300);
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.shop__title {
  margin: 0;
  font-size: clamp(1.4rem, 6vw, 2rem);
}

.shop__wallet {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 0.45rem 0.9rem;
  border: 1px solid rgb(126 220 255 / 30%);
  border-radius: var(--ds-radius-pill);
  background: rgb(8 30 52 / 82%);
  box-shadow: 0 0 18px rgb(90 190 255 / 18%);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.shop__wallet-icon {
  color: #ffd479;
}

.shop__error {
  margin: 0;
  padding: var(--ds-space-sm) var(--ds-space-md);
  border: 1px solid rgb(255 138 138 / 42%);
  border-radius: var(--ds-radius-md);
  background: rgb(76 22 30 / 70%);
  color: #ffd5d5;
}

.shop__section {
  position: relative;
  display: grid;
  gap: var(--ds-space-sm);
}

.shop__section-head {
  display: flex;
  flex-wrap: wrap;
  gap: 4px var(--ds-space-sm);
  align-items: baseline;
}

.shop__section-head h2 {
  margin: 0;
  font-size: 1.1rem;
}

.shop__section-head p {
  margin: 0;
  color: var(--ds-text-secondary);
  font-size: 0.8rem;
}

.shop__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: var(--ds-space-sm);
  margin: 0;
  padding: 0;
  list-style: none;
}

.shop__card {
  display: grid;
  gap: 4px;
  justify-items: center;
  padding: var(--ds-space-md) var(--ds-space-sm);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: linear-gradient(160deg, rgb(13 38 62 / 92%), rgb(6 20 36 / 94%));
  text-align: center;
}

.shop__icon {
  font-size: 2rem;
  line-height: 1.1;
  filter: drop-shadow(0 4px 8px rgb(0 0 0 / 35%));
}

.shop__name {
  font-size: 0.95rem;
}

.shop__effect {
  color: var(--ds-text-secondary);
  font-size: 0.75rem;
}

.shop__owned {
  color: var(--ds-accent-300);
  font-size: 0.75rem;
}

.shop__buy-row {
  display: flex;
  gap: var(--ds-space-sm);
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-top: 4px;
}

.shop__price {
  color: #ffd479;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
  font-weight: 700;
}

.shop__buy {
  min-height: 2.25rem;
  padding: 0 var(--ds-space-md);
  border: 1px solid rgb(126 220 255 / 38%);
  border-radius: var(--ds-radius-pill);
  background: rgb(24 78 116 / 82%);
  color: var(--ds-text-primary);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.shop__buy:disabled {
  border-color: rgb(255 255 255 / 12%);
  background: rgb(255 255 255 / 6%);
  color: var(--ds-text-secondary);
  cursor: not-allowed;
}

.shop__buy:not(:disabled):active {
  transform: scale(0.97);
}

.shop__bag {
  display: grid;
  gap: 6px;
  padding: var(--ds-space-md);
  border: 1px solid var(--ds-glass-border);
  border-radius: var(--ds-radius-lg);
  background: rgb(7 24 42 / 78%);
}

.shop__bag h2 {
  margin: 0;
  font-size: 1rem;
}

.shop__bag-empty,
.shop__bag-list {
  margin: 0;
  color: var(--ds-text-secondary);
  font-size: 0.85rem;
}

.shop__bag-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-sm);
  padding: 0;
  list-style: none;
}

@media (prefers-reduced-motion: reduce) {
  .shop__buy,
  .shop__buy:active {
    transition: none;
    transform: none;
  }
}
</style>
