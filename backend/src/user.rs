use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub ip_address: Option<String>,
    pub status: CallStatus,
    pub last_heartbeat: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CallStatus {
    Idle,
    Calling,
    InCall,
    OnHold,
    Offline,
}

impl Default for CallStatus {
    fn default() -> Self {
        CallStatus::Offline
    }
}

impl User {
    pub fn new(id: String, username: String) -> Self {
        User {
            id,
            username,
            ip_address: None,
            status: CallStatus::Idle,
            last_heartbeat: chrono::Local::now().timestamp(),
        }
    }

    pub fn set_ip_address(&mut self, ip: String) {
        self.ip_address = Some(ip);
    }

    pub fn set_status(&mut self, status: CallStatus) {
        self.status = status;
    }

    pub fn update_heartbeat(&mut self) {
        self.last_heartbeat = chrono::Local::now().timestamp();
    }

    pub fn is_inactive(&self, timeout_secs: i64) -> bool {
        let now = chrono::Local::now().timestamp();
        (now - self.last_heartbeat) > timeout_secs
    }
}

