<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import ChineseQuestView from '@/views/ChineseQuestView.vue'
import { getProductionStores } from '@/app/productionStores'
import { pickChineseDaily } from '@/domain/chinese/daily'
import { countChineseCompletionsToday, MAX_CHINESE_COMPLETIONS_PER_DAY } from '@/domain/chinese/dailyLimit'
import type { ChinesePassage, ChineseQuestion } from '@/domain/chinese/types'
import grade1 from '@/data/content/chinese/grade1.json'
import grade2 from '@/data/content/chinese/grade2.json'
import grade3 from '@/data/content/chinese/grade3-challenge.json'
import grade4 from '@/data/content/chinese/grade4.json'
import grade5 from '@/data/content/chinese/grade5.json'
import grade6 from '@/data/content/chinese/grade6.json'
import passages1 from '@/data/content/chinese/passages.json'
import passages2 from '@/data/content/chinese/passages-grade2.json'
import passages3 from '@/data/content/chinese/passages-grade3-challenge.json'
import passages4 from '@/data/content/chinese/passages-grade4.json'
import passages5 from '@/data/content/chinese/passages-grade5.json'
import passages6 from '@/data/content/chinese/passages-grade6.json'
import { useProfileSessionStore } from '@/features/profileSelect/profileSessionStore'
import { HOME_PATH, PROFILES_PATH } from '@/router/nextRoute'

const router = useRouter()
const session = useProfileSessionStore()
const stores = getProductionStores()
const profileId = computed(() => session.activeProfileId ?? '')
const grade = ref(session.projection?.subjectGrades?.chinese ?? session.projection?.grade ?? 1)
const banks = [
  { questions: grade1.questions, passages: passages1 },
  { questions: grade2.questions, passages: passages2 },
  { questions: grade3.questions, passages: passages3 },
  { questions: grade4.questions, passages: passages4 },
  { questions: grade5.questions, passages: passages5 },
  { questions: grade6.questions, passages: passages6 },
] as const

const completedToday = ref(0)
const checkingLimit = ref(true)
const limitReached = computed(() => completedToday.value >= MAX_CHINESE_COMPLETIONS_PER_DAY)
const selected = computed(() => banks[Math.min(Math.max(grade.value, 1), 6) - 1])
const questions = computed(() => pickChineseDaily(selected.value.questions as ChineseQuestion[], 6))
const passageList = computed(() => selected.value.passages as ChinesePassage[])

onMounted(async () => {
  if (profileId.value === '') {
    checkingLimit.value = false
    void router.push(PROFILES_PATH)
    return
  }
  try {
    // 家长可能刚改过语文年级；以档案表为准，避免必须重新登录。
    const profile = await stores.storage.profiles.get(profileId.value)
    if (profile !== undefined) {
      grade.value = profile.subjectGrades?.chinese ?? profile.grade ?? 1
    }
    const events = await stores.quiz.listEvents(profileId.value)
    completedToday.value = countChineseCompletionsToday(events, profileId.value, Date.now())
  } finally {
    checkingLimit.value = false
  }
})
</script>

<template>
  <p v-if="checkingLimit" class="cn-limit__checking" data-testid="chinese-daily-limit-checking">正在检查今天的语文次数…</p>
  <section v-else-if="profileId !== '' && limitReached" class="cn-limit" data-testid="chinese-daily-limit">
    <span class="cn-limit__art" aria-hidden="true">📚</span>
    <h1>今天的语文探险已完成 {{ MAX_CHINESE_COMPLETIONS_PER_DAY }} 次</h1>
    <p>每天最多通关 {{ MAX_CHINESE_COMPLETIONS_PER_DAY }} 次，明天再来继续积累吧。</p>
    <button type="button" data-testid="chinese-limit-home" @click="router.push(HOME_PATH)">返回首页</button>
  </section>
  <ChineseQuestView
    v-else-if="profileId !== ''"
    :profile-id="profileId"
    :grade="grade"
    :store="stores.quiz"
    :questions="questions"
    :passages="passageList"
    @complete="router.push(HOME_PATH)"
    @exit="router.push(HOME_PATH)"
  />

</template>

<style scoped>
  .cn-limit__checking { min-height: 100dvh; margin: 0; display: grid; place-items: center; color: var(--ds-text-secondary); }
  .cn-limit { display: grid; justify-items: center; gap: var(--ds-space-sm); width: min(32rem, 100%); min-height: 100dvh; margin: 0 auto; padding: 18vh var(--ds-space-lg) 3rem; text-align: center; }
  .cn-limit__art { font-size: 4rem; }
  .cn-limit h1 { margin: 0; font-size: clamp(1.2rem, 5vw, 1.6rem); }
  .cn-limit p { margin: 0; color: var(--ds-text-secondary); line-height: 1.7; }
  .cn-limit button { margin-top: var(--ds-space-sm); min-height: 2.75rem; padding: .55rem 1.2rem; border: 0; border-radius: var(--ds-radius-pill); background: var(--ds-accent-500); color: white; font: inherit; font-weight: 700; }
</style>
