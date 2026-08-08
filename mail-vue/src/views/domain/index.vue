<template>
  <div class="container">
    <div class="header">
      <div class="title">{{ $t("manageDomain") || "Manage Domain" }}</div>
      <el-button type="primary" @click="openAddDialog">
        <Icon icon="ep:plus" class="mr-1" /> {{ $t("addDomain") || "Add Domain" }}
      </el-button>
    </div>

    <el-card class="box-card">
      <el-table :data="domainList" style="width: 100%" v-loading="loading">
        <el-table-column prop="name" :label="$t('domain') || 'Domain'" min-width="180">
          <template #default="scope">
            <div class="domain-cell">
              <span class="font-bold">{{ scope.row.name }}</span>
              <el-tag size="small" type="info" class="ml-2">
                {{ scope.row.source === 'cloudflare' ? 'Cloudflare' : 'Custom' }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <!-- Nameserver Status -->
        <el-table-column label="Nameserver Status" min-width="170">
          <template #default="scope">
            <el-popover
              placement="top"
              :title="'Nameserver Cloudflare (' + scope.row.name + ')'"
              :width="340"
              trigger="hover"
            >
              <template #reference>
                <el-tag
                  :type="scope.row.dnsStatus === 'active' ? 'success' : 'warning'"
                  style="cursor: pointer"
                >
                  {{ scope.row.dnsStatus === 'active' ? 'NS Active' : 'Pending NS' }}
                  <Icon icon="ep:question-filled" class="ml-1" />
                </el-tag>
              </template>
              <div class="ns-popover-content">
                <p class="text-xs text-gray-500 mb-2">
                  Set Nameserver berikut di registrar penyedia domain Anda:
                </p>
                <div
                  v-for="(ns, idx) in (scope.row.nameServers && scope.row.nameServers.length ? scope.row.nameServers : ['isaac.ns.cloudflare.com', 'linda.ns.cloudflare.com'])"
                  :key="idx"
                  class="ns-item"
                >
                  <code class="ns-code">NS {{ idx + 1 }}: {{ ns }}</code>
                  <el-button size="small" type="text" @click="copyText(ns)">
                    <Icon icon="ep:copy-document" /> Copy
                  </el-button>
                </div>
              </div>
            </el-popover>
          </template>
        </el-table-column>

        <!-- MX Records Status -->
        <el-table-column label="MX Records" min-width="130">
          <template #default="scope">
            <el-tag :type="scope.row.mxStatus === 'active' ? 'success' : 'warning'">
              {{ scope.row.mxStatus === 'active' ? 'MX Configured' : 'Check MX' }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- SPF / DMARC Status -->
        <el-table-column label="SPF / DMARC" min-width="140">
          <template #default="scope">
            <el-tag :type="scope.row.spfStatus === 'active' ? 'success' : 'warning'">
              {{ scope.row.spfStatus === 'active' ? 'SPF Active' : 'Check SPF' }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- Email Routing Status -->
        <el-table-column prop="emailRoutingStatus" :label="$t('emailRoutingStatus') || 'Email Routing'" min-width="150">
          <template #default="scope">
            <el-tag :type="scope.row.emailRoutingStatus === 'active' ? 'success' : 'danger'">
              {{ scope.row.emailRoutingStatus === 'active' ? 'Routing Active' : 'Inactive' }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- Actions -->
        <el-table-column :label="$t('action') || 'Action'" width="280" align="right">
          <template #default="scope">
            <el-button
              size="small"
              type="info"
              plain
              @click="openDnsGuide(scope.row)"
            >
              <Icon icon="ep:setting" class="mr-1" /> DNS Guide
            </el-button>
            <el-button
              size="small"
              @click="verifyDomain(scope.row)"
              :loading="scope.row.verifying"
            >
              {{ $t("verify") || "Verify" }}
            </el-button>
            <el-button
              size="small"
              type="danger"
              @click="deleteDomain(scope.row)"
            >
              {{ $t("delete") || "Delete" }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Modal Add Domain -->
    <el-dialog
      v-model="addDialogVisible"
      :title="$t('addDomain') || 'Add Domain'"
      width="500px"
    >
      <el-form :model="addForm" ref="addFormRef" label-width="100px">
        <el-form-item
          :label="$t('domain') || 'Domain'"
          prop="name"
          :rules="[
            { required: true, message: $t('emptyEmailMsg') || 'Domain cannot be empty', trigger: 'blur' },
          ]"
        >
          <el-input
            v-model="addForm.name"
            placeholder="example.com"
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="addForm.autoSetup">
            Auto-Setup Cloudflare Zone & Email Routing
          </el-checkbox>
        </el-form-item>
      </el-form>
      <div class="steps-info" v-if="addForm.autoSetup">
        <p class="font-bold">Langkah Otomatisasi Domain:</p>
        <ol>
          <li>Zone domain akan didaftarkan otomatis ke Cloudflare API.</li>
          <li>Cloudflare Email Routing dan Catch-All Worker akan diaktifkan secara otomatis.</li>
          <li>Anda hanya perlu menyalin Nameserver ke Registrar domain Anda.</li>
        </ol>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="addDialogVisible = false">{{ $t("cancel") || "Cancel" }}</el-button>
          <el-button type="primary" @click="submitAdd" :loading="addLoading">{{ $t("confirm") || "Confirm" }}</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- Modal Detailed DNS Guide & Auto Config -->
    <el-dialog
      v-model="dnsGuideVisible"
      :title="'Panduan Setup DNS & Nameserver: ' + (selectedDomain?.name || '')"
      width="750px"
    >
      <div v-if="selectedDomain" class="dns-guide-body">
        <el-alert
          type="info"
          show-icon
          :closable="false"
          class="mb-4"
        >
          <template #title>
            <b>Atur Nameserver di Penyedia Domain (Registrar)</b>
          </template>
          Buka dashboard penyedia tempat Anda membeli domain (Namecheap, Niagahoster, GoDaddy, Rumahweb, Cloudflare, dll) dan arahkan Nameserver ke:
        </el-alert>

        <!-- Nameservers Copy Box -->
        <div class="ns-cards-container mb-4">
          <div
            v-for="(ns, idx) in (selectedDomain.nameServers && selectedDomain.nameServers.length ? selectedDomain.nameServers : ['isaac.ns.cloudflare.com', 'linda.ns.cloudflare.com'])"
            :key="idx"
            class="ns-card-box"
          >
            <div class="ns-card-label">Nameserver {{ idx + 1 }}</div>
            <div class="ns-card-value">
              <code>{{ ns }}</code>
              <el-button type="primary" size="small" @click="copyText(ns)">
                <Icon icon="ep:copy-document" /> Copy
              </el-button>
            </div>
          </div>
        </div>

        <h4 class="section-title mt-4 mb-2">Record DNS yang Dibutuhkan untuk SyxMail:</h4>
        <el-table :data="getRequiredRecords(selectedDomain)" size="small" border style="width: 100%">
          <el-table-column prop="type" label="Record Type" width="120" />
          <el-table-column prop="name" label="Name / Host" width="110" />
          <el-table-column prop="content" label="Value / Content" min-width="260">
            <template #default="scope">
              <div class="dns-value-cell">
                <code>{{ scope.row.content }}</code>
                <el-button size="small" type="text" @click="copyText(scope.row.content.split(' ')[0])">
                  <Icon icon="ep:copy-document" />
                </el-button>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="Status" width="100">
            <template #default="scope">
              <el-tag size="small" :type="scope.row.status === 'active' ? 'success' : 'warning'">
                {{ scope.row.status === 'active' ? 'Active' : 'Pending' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>

        <div class="mt-4 flex justify-between items-center">
          <el-button
            type="success"
            @click="runAutoFix(selectedDomain)"
            :loading="selectedDomain.verifying"
          >
            <Icon icon="ep:cpu" class="mr-1" /> ⚡ Auto-Setup Email Routing & Catch-All
          </el-button>

          <el-button
            type="primary"
            plain
            @click="verifyDomain(selectedDomain)"
            :loading="selectedDomain.verifying"
          >
            <Icon icon="ep:refresh" class="mr-1" /> Re-check DNS Status
          </el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useI18n } from "vue-i18n";
import http from "@/axios/index.js";

const { t } = useI18n();
const loading = ref(false);
const domainList = ref([]);
const addDialogVisible = ref(false);
const addLoading = ref(false);
const addFormRef = ref(null);

const dnsGuideVisible = ref(false);
const selectedDomain = ref(null);

const addForm = reactive({
  name: "",
  autoSetup: true,
});

const copyText = (text) => {
  if (!text) return;
  navigator.clipboard.writeText(text);
  ElMessage.success("Berhasil disalin ke clipboard!");
};

const getDomainList = async () => {
  loading.value = true;
  try {
    const res = await http.get("/domain/list");
    domainList.value = Array.isArray(res) ? res : res || [];
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const openAddDialog = () => {
  addForm.name = "";
  addForm.autoSetup = true;
  addDialogVisible.value = true;
};

const openDnsGuide = (domain) => {
  selectedDomain.value = domain;
  dnsGuideVisible.value = true;
};

const getRequiredRecords = (domain) => {
  if (domain && Array.isArray(domain.requiredRecords) && domain.requiredRecords.length > 0) {
    return domain.requiredRecords;
  }
  const ns = domain?.nameServers || ['isaac.ns.cloudflare.com', 'linda.ns.cloudflare.com'];
  const isAct = domain?.dnsStatus === 'active';
  const isEr = domain?.emailRoutingStatus === 'active';

  return [
    { type: 'NS 1', name: '@', content: ns[0] || 'isaac.ns.cloudflare.com', status: isAct ? 'active' : 'pending' },
    { type: 'NS 2', name: '@', content: ns[1] || 'linda.ns.cloudflare.com', status: isAct ? 'active' : 'pending' },
    { type: 'MX 1', name: '@', content: 'isaac.mx.cloudflare.net (Priority 10)', status: isEr ? 'active' : 'pending' },
    { type: 'MX 2', name: '@', content: 'linda.mx.cloudflare.net (Priority 20)', status: isEr ? 'active' : 'pending' },
    { type: 'TXT (SPF)', name: '@', content: 'v=spf1 include:_spf.mx.cloudflare.net ~all', status: isEr ? 'active' : 'pending' },
    { type: 'TXT (DMARC)', name: '_dmarc', content: 'v=DMARC1; p=none;', status: 'active' }
  ];
};

const submitAdd = async () => {
  if (!addFormRef.value) return;
  await addFormRef.value.validate(async (valid) => {
    if (valid) {
      addLoading.value = true;
      try {
        await http.post("/domain/add", addForm);
        ElMessage.success(t("addDomainSuccess") || "Domain added successfully!");
        addDialogVisible.value = false;
        getDomainList();
      } catch (error) {
        console.error(error);
      } finally {
        addLoading.value = false;
      }
    }
  });
};

const verifyDomain = async (row) => {
  if (!row) return;
  row.verifying = true;
  try {
    const result = await http.post("/domain/verify", {
      id: row.id,
      name: row.name,
    });
    if (result) {
      if (result.dnsStatus) row.dnsStatus = result.dnsStatus;
      if (result.emailRoutingStatus) row.emailRoutingStatus = result.emailRoutingStatus;
      if (result.nameServers) row.nameServers = result.nameServers;
      if (result.requiredRecords) row.requiredRecords = result.requiredRecords;
    }
    ElMessage.success(t("verifySuccess") || "DNS Status Verified!");
  } catch (error) {
    console.error(error);
  } finally {
    row.verifying = false;
  }
};

const runAutoFix = async (row) => {
  if (!row) return;
  row.verifying = true;
  try {
    await http.post("/domain/verify", {
      id: row.id,
      name: row.name,
    });
    ElMessage.success("⚡ Email Routing & Catch-All Rule berhasil dikonfigurasi!");
    getDomainList();
  } catch (error) {
    console.error(error);
  } finally {
    row.verifying = false;
  }
};

const deleteDomain = (row) => {
  ElMessageBox.confirm(
    t("deleteDomainConfirm") || "Are you sure you want to delete this domain?",
    t("warning") || "Warning",
    {
      confirmButtonText: t("confirm") || "Confirm",
      cancelButtonText: t("cancel") || "Cancel",
      type: "warning",
    }
  ).then(async () => {
    try {
      await http.post("/domain/delete", { id: row.id, name: row.name });
      ElMessage.success(t("deleteSuccess") || "Domain deleted!");
      getDomainList();
    } catch (error) {
      console.error(error);
    }
  });
};

onMounted(() => {
  getDomainList();
});
</script>

<style scoped>
.container {
  padding: 20px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.title {
  font-size: 20px;
  font-weight: bold;
}

.box-card {
  flex: 1;
  overflow: auto;
}

.domain-cell {
  display: flex;
  align-items: center;
}

.ns-popover-content {
  padding: 5px 0;
}

.ns-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--el-fill-color-light, #f5f7fa);
  padding: 4px 8px;
  border-radius: 4px;
  margin-bottom: 4px;
}

.ns-code {
  font-family: monospace;
  font-size: 12px;
}

.steps-info {
  margin-top: 10px;
  padding: 10px;
  background-color: var(--el-fill-color-light, #f5f7fa);
  border-radius: 4px;
  font-size: 12px;
  color: var(--el-text-color-regular, #606266);
}

.steps-info ol {
  padding-left: 20px;
  margin: 5px 0 0 0;
}

.dns-guide-body {
  padding: 5px;
}

.ns-cards-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.ns-card-box {
  background-color: var(--el-fill-color-light, #f5f7fa);
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 6px;
  padding: 10px 12px;
}

.ns-card-label {
  font-size: 11px;
  color: var(--el-text-color-secondary, #909399);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.ns-card-value {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ns-card-value code {
  font-family: monospace;
  font-weight: bold;
  font-size: 13px;
}

.dns-value-cell {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dns-value-cell code {
  font-family: monospace;
  font-size: 12px;
}

.section-title {
  font-weight: bold;
  font-size: 14px;
}

.mr-1 { margin-right: 4px; }
.ml-1 { margin-left: 4px; }
.ml-2 { margin-left: 8px; }
.mb-2 { margin-bottom: 8px; }
.mb-4 { margin-bottom: 16px; }
.mt-4 { margin-top: 16px; }
.font-bold { font-weight: bold; }
.text-xs { font-size: 12px; }
.flex { display: flex; }
.justify-between { justify-content: space-between; }
.items-center { align-items: center; }
</style>
