<template>
  <div class="api-key-page">
    <div class="header-actions">
      <el-button type="primary" class="add-btn" @click="openCreateModal">
        <Icon icon="ion:add-outline" width="18" height="18" style="margin-right: 4px;" />
        {{ $t('createApiKey') || 'Buat API Key' }}
      </el-button>

      <div class="search-box" v-if="isAdmin">
        <el-input
          v-model="searchEmail"
          placeholder="Cari email user..."
          clearable
          @keyup.enter="loadData"
          @clear="loadData"
          style="width: 220px;"
        >
          <template #prefix>
            <Icon icon="iconoir:search" width="16" height="16" />
          </template>
        </el-input>
      </div>

      <el-button circle @click="loadData">
        <Icon icon="ion:reload" width="16" height="16" />
      </el-button>

      <el-button type="info" plain @click="openSwagger">
        <Icon icon="logos:swagger" width="18" height="18" style="margin-right: 6px;" />
        Swagger UI
      </el-button>
    </div>

    <div class="content-box" v-loading="loading">
      <el-table :data="tableData" style="width: 100%" stripe border>
        <el-table-column prop="name" :label="$t('keyName') || 'Nama Key'" min-width="150" />
        <el-table-column prop="keyPrefix" label="Prefix Key" min-width="180">
          <template #default="scope">
            <el-tag type="info" font-family="monospace">{{ scope.row.keyPrefix }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="isAdmin" prop="userEmail" label="User Email" min-width="200" />
        <el-table-column prop="createTime" :label="$t('createdTime') || 'Waktu Dibuat'" min-width="170">
          <template #default="scope">
            <span>{{ formatTime(scope.row.createTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="lastUsedTime" label="Terakhir Digunakan" min-width="170">
          <template #default="scope">
            <span v-if="scope.row.lastUsedTime">{{ formatTime(scope.row.lastUsedTime) }}</span>
            <el-tag v-else type="warning" size="small">Belum pernah</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="Aksi" width="120" fixed="right">
          <template #default="scope">
            <el-popconfirm
              title="Yakin ingin mencabut API Key ini?"
              confirm-button-text="Ya, Hapus"
              cancel-button-text="Batal"
              @confirm="deleteKey(scope.row)"
            >
              <template #reference>
                <el-button type="danger" size="small" plain>Hapus</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- Create API Key Dialog -->
    <el-dialog v-model="showCreateDialog" title="Buat API Key Baru" width="450px">
      <el-form label-position="top">
        <el-form-item label="Nama API Key" required>
          <el-input v-model="createForm.name" placeholder="Misal: Bot Tele, Script Python..." />
        </el-form-item>

        <el-form-item v-if="isAdmin" label="Pilih User (Opsional untuk Admin)">
          <el-select
            v-model="createForm.userId"
            placeholder="Default: Diri Sendiri"
            filterable
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="u in userOptions"
              :key="u.userId"
              :label="u.email"
              :value="u.userId"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">Batal</el-button>
        <el-button type="primary" :loading="createLoading" @click="submitCreate">Buat Key</el-button>
      </template>
    </el-dialog>

    <!-- Raw API Key Result Modal -->
    <el-dialog v-model="showResultDialog" title="🎉 API Key Berhasil Dibuat" width="500px" :close-on-click-modal="false">
      <el-alert
        title="Penting: Simpan API Key ini sekarang!"
        type="warning"
        description="Demi keamanan, kunci ini hanya akan ditampilkan SATU KALI INI SAJA dan tidak dapat dilihat lagi setelah ditutup."
        show-icon
        :closable="false"
        style="margin-bottom: 16px;"
      />

      <div class="raw-key-box">
        <el-input v-model="rawApiKey" readonly select-all-on-focus>
          <template #append>
            <el-button type="primary" @click="copyRawKey">
              <Icon icon="fluent:copy-24-regular" width="18" height="18" /> Copot
            </el-button>
          </template>
        </el-input>
      </div>

      <template #footer>
        <el-button type="primary" @click="showResultDialog = false">Saya Sudah Menyimpannya</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue';
import { Icon } from '@iconify/vue';
import { ElMessage } from 'element-plus';
import axios from '@/axios';
import { useUserStore } from '@/store/user.js';
import { tzDayjs } from '@/utils/day.js';

const formatTime = (time) => {
  if (!time) return '';
  return tzDayjs(time).format('YYYY-MM-DD HH:mm:ss');
};

const userStore = useUserStore();
const isAdmin = ref(userStore.user?.email === 'admin' || userStore.user?.permKeys?.includes('api-key:admin') || userStore.user?.permKeys?.includes('*'));

const loading = ref(false);
const tableData = ref([]);
const searchEmail = ref('');

const showCreateDialog = ref(false);
const createLoading = ref(false);
const createForm = reactive({
  name: '',
  userId: null
});

const userOptions = ref([]);

const showResultDialog = ref(false);
const rawApiKey = ref('');

const loadData = async () => {
  loading.value = true;
  try {
    const url = isAdmin.value ? '/apiKey/allList' : '/apiKey/list';
    const params = isAdmin.value ? { email: searchEmail.value } : {};
    const res = await axios.get(url, { params });
    tableData.value = Array.isArray(res) ? res : (res?.list || []);
  } catch (err) {
    console.error('Failed to load API keys:', err);
  } finally {
    loading.value = false;
  }
};

const loadUsersForAdmin = async () => {
  if (!isAdmin.value) return;
  try {
    const res = await axios.get('/user/list', { params: { size: 100 } });
    userOptions.value = res?.list || [];
  } catch (e) {
    console.warn(e);
  }
};

const openCreateModal = () => {
  createForm.name = '';
  createForm.userId = null;
  showCreateDialog.value = true;
  loadUsersForAdmin();
};

const submitCreate = async () => {
  if (!createForm.name.trim()) {
    ElMessage.warning('Nama API Key wajib diisi');
    return;
  }

  createLoading.value = true;
  try {
    let res;
    if (isAdmin.value && createForm.userId) {
      res = await axios.post('/apiKey/adminCreate', {
        userId: createForm.userId,
        name: createForm.name
      });
    } else {
      res = await axios.post('/apiKey/create', {
        name: createForm.name
      });
    }

    if (res && res.apiKey) {
      rawApiKey.value = res.apiKey;
      showCreateDialog.value = false;
      showResultDialog.value = true;
      loadData();
    }
  } catch (err) {
    console.error('Failed to create API key:', err);
  } finally {
    createLoading.value = false;
  }
};

const deleteKey = async (row) => {
  try {
    const url = isAdmin.value ? `/apiKey/adminDelete?keyId=${row.keyId}` : `/apiKey/delete?keyId=${row.keyId}`;
    await axios.delete(url);
    ElMessage.success('API Key berhasil dicabut');
    loadData();
  } catch (err) {
    console.error('Failed to delete API key:', err);
  }
};

const copyRawKey = () => {
  navigator.clipboard.writeText(rawApiKey.value);
  ElMessage.success('API Key berhasil disalin!');
};

const openSwagger = () => {
  window.open('/api/swagger', '_blank');
};

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.api-key-page {
  padding: 20px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.raw-key-box {
  margin-top: 10px;
}
</style>
