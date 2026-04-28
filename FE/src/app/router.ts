import { createRouter, createWebHistory } from 'vue-router'
import DashboardPage from '@/pages/Dashboard/DashboardPage.vue'
import ProjectPage from '@/pages/Project/ProjectPage.vue'
import OnboardingPage from '@/pages/Onboarding/OnboardingPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/onboarding',
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: OnboardingPage,
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: DashboardPage,
    },
    {
      path: '/project',
      name: 'project',
      component: ProjectPage,
    },
    {
      path: '/project/:projectId',
      name: 'project-detail',
      component: ProjectPage,
    },
  ],
})

export default router
