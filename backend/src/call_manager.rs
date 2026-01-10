use crate::user::{User, CallStatus};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Call {
    pub call_id: String,
    pub caller_id: String,
    pub callee_id: String,
    pub status: CallStatus,
    pub timestamp: i64,
}

pub struct CallManager {
    users: HashMap<String, User>,
    calls: HashMap<String, Call>,
}

impl CallManager {
    pub fn new() -> Self {
        CallManager {
            users: HashMap::new(),
            calls: HashMap::new(),
        }
    }

    pub fn register_user(&mut self, user_id: String, username: String) {
        let mut user = User::new(user_id, username);
        user.set_status(CallStatus::Idle);
        self.users.insert(user.id.clone(), user);
    }

    pub fn list_users(&self) -> Vec<User> {
        self.users
            .values()
            .filter(|u| u.status != CallStatus::Offline)
            .cloned()
            .collect()
    }

    pub fn disconnect_user(&mut self, user_id: &str) -> bool {
        if let Some(user) = self.users.get_mut(user_id) {
            user.set_status(CallStatus::Offline);
            true
        } else {
            false
        }
    }

    pub fn get_user(&self, user_id: &str) -> Option<&User> {
        self.users.get(user_id)
    }

    pub fn update_user_status(&mut self, user_id: &str, status: CallStatus) -> bool {
        if let Some(user) = self.users.get_mut(user_id) {
            user.set_status(status);
            true
        } else {
            false
        }
    }

    pub fn update_user_ip(&mut self, user_id: &str, ip: String) -> bool {
        if let Some(user) = self.users.get_mut(user_id) {
            user.set_ip_address(ip);
            true
        } else {
            false
        }
    }

    pub fn create_call(&mut self, caller_id: String, callee_id: String) -> Call {
        let call_id = uuid::Uuid::new_v4().to_string();
        let call = Call {
            call_id: call_id.clone(),
            caller_id: caller_id.clone(),
            callee_id: callee_id.clone(),
            status: CallStatus::Calling,
            timestamp: chrono::Local::now().timestamp(),
        };
        
        self.calls.insert(call_id, call.clone());
        self.update_user_status(&caller_id, CallStatus::Calling);
        
        call
    }

    pub fn accept_call(&mut self, call_id: &str) {
        if let Some(call) = self.calls.get_mut(call_id) {
            let caller_id = call.caller_id.clone();
            let callee_id = call.callee_id.clone();
            call.status = CallStatus::InCall;
            let _ = call;
            self.update_user_status(&caller_id, CallStatus::InCall);
            self.update_user_status(&callee_id, CallStatus::InCall);
        }
    }

    pub fn reject_call(&mut self, call_id: &str) {
        if let Some(call) = self.calls.get_mut(call_id) {
            let caller_id = call.caller_id.clone();
            let callee_id = call.callee_id.clone();
            call.status = CallStatus::Idle;
            let _ = call;
            self.update_user_status(&caller_id, CallStatus::Idle);
            self.update_user_status(&callee_id, CallStatus::Idle);
            self.calls.remove(call_id);
        }
    }

    pub fn hold_call(&mut self, call_id: &str) {
        if let Some(call) = self.calls.get_mut(call_id) {
            let caller_id = call.caller_id.clone();
            let callee_id = call.callee_id.clone();
            call.status = CallStatus::OnHold;
            let _ = call;
            self.update_user_status(&caller_id, CallStatus::OnHold);
            self.update_user_status(&callee_id, CallStatus::OnHold);
        }
    }

    pub fn end_call(&mut self, call_id: &str) {
        if let Some(call) = self.calls.get_mut(call_id) {
            let caller_id = call.caller_id.clone();
            let callee_id = call.callee_id.clone();
            self.update_user_status(&caller_id, CallStatus::Idle);
            self.update_user_status(&callee_id, CallStatus::Idle);
            self.calls.remove(call_id);
        }
    }

    pub fn get_call(&self, call_id: &str) -> Option<&Call> {
        self.calls.get(call_id)
    }

    pub fn get_incoming_calls(&self, user_id: &str) -> Vec<Call> {
        self.calls
            .values()
            .filter(|call| call.callee_id == user_id && call.status == CallStatus::Calling)
            .cloned()
            .collect()
    }
}
