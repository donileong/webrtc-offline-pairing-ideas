<script lang="ts">
  import { router } from './routerStore.svelte';
  import HomeView from '../../views/HomeView.svelte';
  import ConnectView from '../../views/ConnectView.svelte';
  import RoomView from '../../views/RoomView.svelte';

  let CurrentView = $derived.by(() => {
    if (router.path === '/') {
      return HomeView;
    }
    if (router.match('/connect/:method')) {
      return ConnectView;
    }
    if (router.path === '/room') {
      return RoomView;
    }
    return HomeView;
  });
</script>

<CurrentView />
