//! TwistedFlow `#[node]` proc macro.
//!
//! Generates `NodeMeta` trait implementation and `inventory` registration
//! from struct-level attributes.
//!
//! Usage:
//! ```ignore
//! #[node(
//!     name = "Log",
//!     type_id = "log",
//!     category = "Data",
//!     description = "Log a value to the console",
//! )]
//! struct LogNode;
//! ```
//!
//! Generates:
//! - `impl NodeMeta for LogNode { fn metadata() -> &'static NodeMetadata { ... } }`
//! - `inventory::submit!(NodeRegistration { ... })` for auto-discovery

use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, DeriveInput, Expr, Lit, Meta};

/// Attribute macro for declaring a TwistedFlow node.
///
/// Required attributes:
/// - `name`: Display name (e.g., "HTTP Request")
/// - `type_id`: Node type identifier matching the frontend (e.g., "httpRequest")
/// - `category`: Node category for palette grouping (e.g., "HTTP", "Data", "Flow Control")
///
/// Optional attributes:
/// - `description`: Human-readable description
#[proc_macro_attribute]
pub fn node(attr: TokenStream, item: TokenStream) -> TokenStream {
    let input = parse_macro_input!(item as DeriveInput);
    let struct_name = &input.ident;

    // Parse key-value attributes from #[node(...)].
    //
    // In a proc-macro attribute, `attr` contains only the tokens *inside* the
    // parentheses — i.e. `name = "Log", type_id = "log", ...` — with no outer
    // wrapper. Parse it directly as a comma-separated list of `Meta` items.
    let nested = match syn::parse::Parser::parse(
        syn::punctuated::Punctuated::<Meta, syn::Token![,]>::parse_terminated,
        attr.clone(),
    ) {
        Ok(n) => n,
        Err(e) => {
            return syn::Error::new(
                e.span(),
                "Expected #[node(name = \"...\", type_id = \"...\", category = \"...\")]",
            )
            .to_compile_error()
            .into();
        }
    };

    let mut name: Option<String> = None;
    let mut type_id: Option<String> = None;
    let mut category: Option<String> = None;
    let mut description: Option<String> = None;

    for meta in nested {
        if let Meta::NameValue(nv) = meta {
            let key = nv.path.get_ident().map(|i| i.to_string());
            let value = match &nv.value {
                Expr::Lit(expr_lit) => {
                    if let Lit::Str(s) = &expr_lit.lit {
                        Some(s.value())
                    } else {
                        None
                    }
                }
                _ => None,
            };

            match (key.as_deref(), value) {
                (Some("name"), Some(v)) => name = Some(v),
                (Some("type_id"), Some(v)) => type_id = Some(v),
                (Some("category"), Some(v)) => category = Some(v),
                (Some("description"), Some(v)) => description = Some(v),
                _ => {}
            }
        }
    }

    let name = match name {
        Some(n) => n,
        None => {
            return syn::Error::new_spanned(struct_name, "Missing `name` attribute in #[node]")
                .to_compile_error()
                .into();
        }
    };
    let type_id = match type_id {
        Some(t) => t,
        None => {
            return syn::Error::new_spanned(struct_name, "Missing `type_id` attribute in #[node]")
                .to_compile_error()
                .into();
        }
    };
    let category = category.unwrap_or_else(|| "Custom".to_string());
    let description = description.unwrap_or_default();

    let expanded = quote! {
        #input

        impl twistedflow_engine::node::NodeMeta for #struct_name {
            fn metadata() -> &'static twistedflow_engine::node::NodeMetadata {
                static META: std::sync::OnceLock<twistedflow_engine::node::NodeMetadata> =
                    std::sync::OnceLock::new();
                META.get_or_init(|| twistedflow_engine::node::NodeMetadata {
                    name: #name.to_string(),
                    type_id: #type_id.to_string(),
                    category: #category.to_string(),
                    description: #description.to_string(),
                    inputs: Vec::new(),
                    outputs: Vec::new(),
                })
            }
        }

        inventory::submit! {
            twistedflow_engine::node::NodeRegistration {
                type_id: #type_id,
                create: || Box::new(#struct_name),
                metadata_fn: || <#struct_name as twistedflow_engine::node::NodeMeta>::metadata(),
            }
        }
    };

    expanded.into()
}
