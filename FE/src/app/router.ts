import { createRouter, createWebHistory } from 'vue-router'
import DashboardPage from '@/pages/Dashboard/DashboardPage.vue'
import ProjectPage from '@/pages/Project/ProjectPage.vue'
import OnboardingPage from '@/pages/Onboarding/OnboardingPage.vue'
import ProfileSetupPage from '@/pages/Onboarding/ProfileSetupPage.vue'
import AuthCallbackPage from '@/pages/Auth/AuthCallbackPage.vue'

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
    path: '/onboarding/profile-setup',
    name: 'profile-setup',
    component: ProfileSetupPage,
    },
    {
    path: '/auth/callback',
    name: 'AuthCallback',
    component: AuthCallbackPage,
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
